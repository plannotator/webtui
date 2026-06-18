import { FitAddon } from '@xterm/addon-fit'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import type { IDisposable, ITerminalOptions, Terminal } from '@xterm/xterm'

import {
  createAgentStatusOscProcessor,
  createAgentStatusTracker,
  detectAgentStatusFromTitle,
  type AgentConfigMap,
  type AgentLaunchPlan,
  type AgentPrompt,
  type AgentStatusPayload,
  type PtyBackend,
  type PtySession,
  type TerminalAgentStatus,
  type Unsubscribe
} from '../core/index.js'
import { scheduleAgentFollowupPrompt } from './agent-followup-prompt.js'
import {
  createAgentPasteQueue,
  createAgentPasteReadinessTracker,
  submitBracketedPasteToAgent
} from './agent-paste-ready.js'
import { resolveAgentSessionLaunch } from './agent-session-spawn-options.js'
import type { AgentReadinessOptions } from './agent-ready.js'
import { createWebTuiTerminal } from './terminal-defaults.js'
import { installTerminalDropHandler, type TerminalDropEvent } from './terminal-drop.js'
import {
  createTerminalFontZoomController,
  type TerminalFontZoomConfig,
  type TerminalFontZoomDirection
} from './terminal-font-zoom.js'
import { installTerminalImePositionFix } from './terminal-ime.js'
import { installTerminalLinks, type TerminalLinkConfig } from './terminal-links.js'
import { terminalOutputPrefersRenderRefresh } from './terminal-complex-script.js'
import {
  attachTerminalWebglRenderer,
  type TerminalGpuAcceleration
} from './terminal-webgl-renderer.js'
import { handleTerminalKeyboardShortcut } from './terminal-keyboard-shortcuts.js'
import {
  discardForegroundRenderSettle,
  writeForegroundTerminalChunk
} from './write-foreground-terminal-chunk.js'

export {
  DEFAULT_WEBTUI_FONT_FAMILY,
  DEFAULT_WEBTUI_THEME
} from './terminal-defaults.js'

export type WebTuiSession = {
  terminal: Terminal
  pty: PtySession
  launchPlan: AgentLaunchPlan | null
  write(data: string): void
  sendAgentMessage(message: AgentRuntimeMessage): boolean
  setTerminalColorScheme(mode: TerminalColorSchemeMode): void
  resize(): void
  setFontSize(size: number): number
  zoomFont(direction: TerminalFontZoomDirection): number
  zoomFontIn(): number
  zoomFontOut(): number
  resetFontZoom(): number
  copySelection(): Promise<string>
  pasteText(text: string): void
  dispose(): void
}

export type AgentRuntimeMessage = {
  text: string
}

export type TerminalColorSchemeMode = 'dark' | 'light'

export type CreateAgentTerminalSessionOptions = {
  container: HTMLElement
  backend: PtyBackend
  cwd?: string
  env?: Record<string, string>
  command?: string
  agent?: string
  prompt?: AgentPrompt | null
  customAgents?: AgentConfigMap
  commandOverrides?: Record<string, string>
  agentReadiness?: boolean | AgentReadinessOptions
  terminalOptions?: ITerminalOptions
  terminalColorScheme?: TerminalColorSchemeMode
  terminalLinks?: TerminalLinkConfig
  terminalGpuAcceleration?: TerminalGpuAcceleration
  fontZoom?: TerminalFontZoomConfig
  onTitle?: (title: string) => void
  onAgentStatus?: (payload: AgentStatusPayload) => void
  onTitleStatus?: (status: TerminalAgentStatus, title: string) => void
  onExit?: (event: { exitCode: number | null; signal?: number | string | null }) => void
  onDrop?: (event: TerminalDropEvent) => void
}

const TERMINAL_RENDERER_RISK_SCAN_TAIL_CHARS = 64

export async function createAgentTerminalSession(
  options: CreateAgentTerminalSessionOptions
): Promise<WebTuiSession> {
  const terminal = createWebTuiTerminal(options.terminalOptions)
  const fitAddon = new FitAddon()
  const unicode11Addon = new Unicode11Addon()
  terminal.open(options.container)
  terminal.loadAddon(fitAddon)
  terminal.loadAddon(unicode11Addon)
  const linkOptions: Parameters<typeof installTerminalLinks>[0] = { terminal }
  if (options.terminalLinks !== undefined) {
    linkOptions.config = options.terminalLinks
  }
  if (options.cwd !== undefined) {
    linkOptions.cwd = options.cwd
  }
  const linkTeardown = installTerminalLinks(linkOptions)
  const imeTeardown = installTerminalImePositionFix(terminal)
  // Width tables are applied when bytes enter the buffer. Activate Unicode 11
  // before spawning so emoji and wide prompt glyphs do not crowd adjacent cells.
  terminal.unicode.activeVersion = '11'
  const webglRenderer = attachTerminalWebglRenderer({
    terminal,
    fitAddon,
    mode: options.terminalGpuAcceleration ?? 'auto'
  })
  fitSafely(fitAddon)

  const { launchPlan, spawnOptions } = resolveAgentSessionLaunch({
    ...options,
    cols: terminal.cols,
    rows: terminal.rows
  })
  let pty: PtySession
  try {
    pty = await options.backend.spawn(spawnOptions)
  } catch (err) {
    imeTeardown()
    linkTeardown()
    webglRenderer.dispose()
    terminal.dispose()
    throw err
  }

  let lastTitle = ''
  let followupTeardown = (): void => undefined
  let foregroundRefreshRiskScanTail = ''
  const pasteReadinessTracker = launchPlan ? createAgentPasteReadinessTracker(pty) : null
  const statusProcessor = createAgentStatusOscProcessor()
  const titleTracker = createAgentStatusTracker({
    onBecameIdle: (title) => options.onTitleStatus?.('idle', title),
    onBecameWorking: (title) => options.onTitleStatus?.('working', title),
    onAgentExited: () => undefined
  })
  const colorSchemeProtocol = installTerminalColorSchemeProtocol({
    terminal,
    pty,
    mode: options.terminalColorScheme ?? inferTerminalColorScheme(options.terminalOptions?.theme)
  })

  const disposables: Unsubscribe[] = []
  const trailingIncompleteCsiSequence = (data: string): string => {
    const escapeIndex = data.lastIndexOf('\x1b[')
    if (escapeIndex === -1) {
      return ''
    }
    const tail = data.slice(escapeIndex)
    for (let index = 2; index < tail.length; index += 1) {
      const code = tail.charCodeAt(index)
      if (code >= 0x40 && code <= 0x7e) {
        return ''
      }
    }
    return tail.slice(-TERMINAL_RENDERER_RISK_SCAN_TAIL_CHARS)
  }
  const foregroundOutputPrefersRenderRefresh = (data: string): boolean => {
    if (!data) {
      return false
    }
    const scanData = foregroundRefreshRiskScanTail
      ? `${foregroundRefreshRiskScanTail}${data}`
      : data
    const prefersRefresh = terminalOutputPrefersRenderRefresh(scanData)
    foregroundRefreshRiskScanTail = trailingIncompleteCsiSequence(scanData)
    return prefersRefresh
  }
  disposables.push(
    pty.onData((data) => {
      const processed = statusProcessor(data)
      for (const payload of processed.payloads) {
        options.onAgentStatus?.(payload)
      }
      writeForegroundTerminalChunk(terminal, processed.cleanData, {
        forceViewportRefresh: foregroundOutputPrefersRenderRefresh(processed.cleanData)
      })
    })
  )
  disposables.push(
    pty.onExit((event) => {
      options.onExit?.(event)
      terminal.write(`\r\n[process exited${event.exitCode === null ? '' : `: ${event.exitCode}`}]\r\n`)
    })
  )

  const titleDisposable = terminal.onTitleChange((title) => {
    lastTitle = title
    options.onTitle?.(title)
    const status = detectAgentStatusFromTitle(title)
    if (status) {
      options.onTitleStatus?.(status, title)
    }
    titleTracker.handleTitle(title)
  })
  const dataDisposable = terminal.onData((data) => pty.write(data))
  const resizeDisposable = terminal.onResize(({ cols, rows }) => pty.resize(cols, rows))
  const fontZoom = createTerminalFontZoomController({
    terminal,
    config: options.fontZoom,
    onChange: () => refitAndResize(fitAddon, terminal, pty)
  })
  terminal.attachCustomKeyEventHandler((event) =>
    handleTerminalKeyboardShortcut(event, terminal, pty, fontZoom)
  )

  const resizeObserver =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
          refitAndResize(fitAddon, terminal, pty)
        })
  resizeObserver?.observe(options.container)

  const dropTeardown = installTerminalDropHandler(options.container, options.onDrop)
  const pasteQueue = createAgentPasteQueue()

  if (launchPlan?.followupPrompt) {
    const followupOptions: Parameters<typeof scheduleAgentFollowupPrompt>[0] = {
      pty,
      prompt: launchPlan.followupPrompt,
      expectedProcess: launchPlan.expectedProcess,
      getTitle: () => lastTitle,
      pasteQueue,
      draftPasteReadySignal: launchPlan.draftPasteReadySignal
    }
    if (pasteReadinessTracker) {
      followupOptions.pasteReadinessTracker = pasteReadinessTracker
    }
    if (options.agentReadiness !== undefined) {
      followupOptions.agentReadiness = options.agentReadiness
    }
    followupTeardown = scheduleAgentFollowupPrompt(followupOptions)
  }

  const sendAgentMessage = (message: AgentRuntimeMessage): boolean => {
    const text = message.text.trim()
    if (!text) {
      return false
    }
    void submitBracketedPasteToAgent({
      pty,
      content: text,
      submit: true,
      queue: pasteQueue
    })
    return true
  }

  return {
    terminal,
    pty,
    launchPlan,
    write(data: string): void {
      pty.write(data)
    },
    sendAgentMessage,
    setTerminalColorScheme(mode: TerminalColorSchemeMode): void {
      colorSchemeProtocol.setMode(mode)
    },
    resize(): void {
      refitAndResize(fitAddon, terminal, pty)
    },
    setFontSize(size: number): number {
      return fontZoom.setFontSize(size)
    },
    zoomFont(direction: TerminalFontZoomDirection): number {
      return fontZoom.zoomFont(direction)
    },
    zoomFontIn(): number {
      return fontZoom.zoomFontIn()
    },
    zoomFontOut(): number {
      return fontZoom.zoomFontOut()
    },
    resetFontZoom(): number {
      return fontZoom.resetFontZoom()
    },
    async copySelection(): Promise<string> {
      const selection = terminal.getSelection()
      if (selection && globalThis.navigator?.clipboard) {
        await globalThis.navigator.clipboard.writeText(selection)
      }
      return selection
    },
    pasteText(text: string): void {
      pty.write(text)
    },
    dispose(): void {
      followupTeardown()
      for (const dispose of disposables) {
        dispose()
      }
      colorSchemeProtocol.dispose()
      pasteReadinessTracker?.dispose()
      titleDisposable.dispose()
      dataDisposable.dispose()
      resizeDisposable.dispose()
      resizeObserver?.disconnect()
      dropTeardown()
      imeTeardown()
      linkTeardown()
      discardForegroundRenderSettle(terminal)
      webglRenderer.dispose()
      titleTracker.reset()
      terminal.dispose()
    }
  }
}

function fitSafely(fitAddon: FitAddon): void {
  try {
    fitAddon.fit()
  } catch {
    // Fit can throw while the container is detached; the next resize will retry.
  }
}

function refitAndResize(fitAddon: FitAddon, terminal: Terminal, pty: PtySession): void {
  fitSafely(fitAddon)
  pty.resize(terminal.cols, terminal.rows)
}

function installTerminalColorSchemeProtocol(args: {
  terminal: Terminal
  pty: PtySession
  mode: TerminalColorSchemeMode
}): { setMode(mode: TerminalColorSchemeMode): void; dispose(): void } {
  let mode = args.mode
  let subscribed = false
  const disposables: IDisposable[] = [
    args.terminal.parser.registerCsiHandler({ prefix: '?', final: 'h' }, (params) => {
      if (hasMode2031(params)) {
        subscribed = true
        args.pty.write(mode2031SequenceFor(mode))
      }
      return false
    }),
    args.terminal.parser.registerCsiHandler({ prefix: '?', final: 'l' }, (params) => {
      if (hasMode2031(params)) {
        subscribed = false
      }
      return false
    })
  ]
  return {
    setMode(nextMode: TerminalColorSchemeMode): void {
      if (mode === nextMode) {
        return
      }
      mode = nextMode
      if (subscribed) {
        args.pty.write(mode2031SequenceFor(mode))
      }
    },
    dispose(): void {
      for (const disposable of disposables) {
        disposable.dispose()
      }
    }
  }
}

function hasMode2031(params: (number | number[])[]): boolean {
  return params.some((param) => (Array.isArray(param) ? param.includes(2031) : param === 2031))
}

function mode2031SequenceFor(mode: TerminalColorSchemeMode): string {
  return mode === 'dark' ? '\x1b[?997;1n' : '\x1b[?997;2n'
}

function inferTerminalColorScheme(theme: ITerminalOptions['theme'] | undefined): TerminalColorSchemeMode {
  const luminance = relativeLuminanceFromHex(theme?.background)
  return luminance !== null && luminance > 0.5 ? 'light' : 'dark'
}

function relativeLuminanceFromHex(color: string | undefined): number | null {
  if (!color) {
    return null
  }
  const match = color.trim().match(/^#([0-9a-f]{6})$/i)
  if (!match) {
    return null
  }
  const value = match[1]
  if (!value) {
    return null
  }
  const rgb: [number, number, number] = [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16)
  ]
  const convert = (channel: number): number => {
    const normalized = channel / 255
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * convert(rgb[0]) + 0.7152 * convert(rgb[1]) + 0.0722 * convert(rgb[2])
}
