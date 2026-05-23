import { FitAddon } from '@xterm/addon-fit'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import type { ITerminalOptions, Terminal } from '@xterm/xterm'

import {
  createAgentStatusOscProcessor,
  createAgentStatusTracker,
  createBracketedPastePayload,
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
import { terminalOutputRequiresDomRenderer } from './terminal-complex-script.js'
import {
  attachTerminalWebglRenderer,
  type TerminalGpuAcceleration
} from './terminal-webgl-renderer.js'
import { handleTerminalKeyboardShortcut } from './terminal-keyboard-shortcuts.js'

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
  terminalLinks?: TerminalLinkConfig
  terminalGpuAcceleration?: TerminalGpuAcceleration
  fontZoom?: TerminalFontZoomConfig
  onTitle?: (title: string) => void
  onAgentStatus?: (payload: AgentStatusPayload) => void
  onTitleStatus?: (status: TerminalAgentStatus, title: string) => void
  onExit?: (event: { exitCode: number | null; signal?: number | string | null }) => void
  onDrop?: (event: TerminalDropEvent) => void
}

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
  const statusProcessor = createAgentStatusOscProcessor()
  const titleTracker = createAgentStatusTracker({
    onBecameIdle: (title) => options.onTitleStatus?.('idle', title),
    onBecameWorking: (title) => options.onTitleStatus?.('working', title),
    onAgentExited: () => undefined
  })

  const disposables: Unsubscribe[] = []
  disposables.push(
    pty.onData((data) => {
      const processed = statusProcessor(data)
      for (const payload of processed.payloads) {
        options.onAgentStatus?.(payload)
      }
      if (terminalOutputRequiresDomRenderer(processed.cleanData)) {
        webglRenderer.markComplexScriptOutput()
      }
      terminal.write(processed.cleanData)
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

  if (launchPlan?.followupPrompt) {
    const followupOptions: Parameters<typeof scheduleAgentFollowupPrompt>[0] = {
      pty,
      prompt: launchPlan.followupPrompt,
      expectedProcess: launchPlan.expectedProcess,
      getTitle: () => lastTitle
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
    pty.write(createBracketedPastePayload(text))
    window.setTimeout(() => pty.write('\r'), 350)
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
      titleDisposable.dispose()
      dataDisposable.dispose()
      resizeDisposable.dispose()
      resizeObserver?.disconnect()
      dropTeardown()
      imeTeardown()
      linkTeardown()
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
