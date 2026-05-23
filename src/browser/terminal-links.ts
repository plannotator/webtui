import { WebLinksAddon } from '@xterm/addon-web-links'
import type { ILink, ILinkProvider, Terminal } from '@xterm/xterm'

export type TerminalResolvedFileLink = {
  path: string
  text: string
  line: number | null
  column: number | null
}

export type TerminalFileLinkOptions = {
  cwd?: string
  pathExists?: (path: string) => boolean | Promise<boolean>
  openFile?: (link: TerminalResolvedFileLink, event: MouseEvent) => void
  hoverHint?: (link: TerminalResolvedFileLink) => string
}

export type TerminalLinkOptions = {
  tooltip?: boolean
  openUrl?: (event: MouseEvent, uri: string) => void
  urlHoverHint?: (uri: string) => string
  fileLinks?: boolean | TerminalFileLinkOptions
}

export type TerminalLinkConfig = boolean | TerminalLinkOptions

export type TerminalExtractedFileLink = {
  startIndex: number
  endIndex: number
  text: string
  line: number | null
  column: number | null
}

export function installTerminalLinks(args: {
  terminal: Terminal
  config?: TerminalLinkConfig
  cwd?: string
}): () => void {
  if (args.config === false) {
    return () => undefined
  }

  const config = typeof args.config === 'object' ? args.config : {}
  const disposables: (() => void)[] = []
  const tooltip = config.tooltip === false ? null : createLinkTooltip(args.terminal)
  if (tooltip) {
    disposables.push(() => tooltip.remove())
  }

  const webLinksAddon = new WebLinksAddon(config.openUrl, {
    hover: (_event, uri) => {
      if (tooltip) {
        tooltip.textContent = config.urlHoverHint?.(uri) ?? `${uri} (${getUrlOpenHint()})`
        tooltip.style.display = ''
      }
    },
    leave: () => {
      if (tooltip) {
        tooltip.style.display = 'none'
      }
    }
  })
  args.terminal.loadAddon(webLinksAddon)
  disposables.push(() => webLinksAddon.dispose())

  const fileLinkOptions = resolveFileLinkOptions(config.fileLinks, args.cwd)
  const openFile = fileLinkOptions?.openFile
  if (fileLinkOptions && openFile) {
    const provider = createFilePathLinkProvider(
      args.terminal,
      { ...fileLinkOptions, openFile },
      tooltip
    )
    const disposable = args.terminal.registerLinkProvider(provider)
    disposables.push(() => disposable.dispose())
  }

  return () => {
    for (const dispose of disposables.reverse()) {
      dispose()
    }
  }
}

export function extractTerminalFileLinks(lineText: string): TerminalExtractedFileLink[] {
  const links: TerminalExtractedFileLink[] = []
  const pathPattern =
    /(^|[\s([{<])((?:(?:[A-Za-z]:[\\/]|~[\\/]|\.{1,2}[\\/]|\/)|(?:[\w.-]+[\\/]))[^\s'")\]}<>]+)/g

  for (const match of lineText.matchAll(pathPattern)) {
    const prefix = match[1] ?? ''
    const rawText = match[2]
    if (!rawText) {
      continue
    }
    const parsed = parseFileLinkText(rawText)
    if (!parsed) {
      continue
    }
    const startIndex = (match.index ?? 0) + prefix.length
    links.push({
      startIndex,
      endIndex: startIndex + parsed.displayText.length,
      text: parsed.path,
      line: parsed.line,
      column: parsed.column
    })
  }

  return links
}

function createFilePathLinkProvider(
  terminal: Terminal,
  options: TerminalFileLinkOptions & {
    openFile: NonNullable<TerminalFileLinkOptions['openFile']>
  },
  tooltip: HTMLElement | null
): ILinkProvider {
  const existsCache = new Map<string, boolean>()

  return {
    provideLinks(bufferLineNumber, callback) {
      const bufferLine = terminal.buffer.active.getLine(bufferLineNumber - 1)
      const lineText = bufferLine?.translateToString(true)
      if (!lineText) {
        callback(undefined)
        return
      }

      const candidates = extractTerminalFileLinks(lineText)
      if (candidates.length === 0) {
        callback(undefined)
        return
      }

      void Promise.all(
        candidates.map(async (candidate): Promise<ILink | null> => {
          const resolvedPath = resolveFilePath(candidate.text, options.cwd)
          if (!resolvedPath) {
            return null
          }
          if (options.pathExists) {
            const cached = existsCache.get(resolvedPath)
            const exists = cached ?? (await options.pathExists(resolvedPath))
            existsCache.set(resolvedPath, exists)
            if (!exists) {
              return null
            }
          }

          const link: TerminalResolvedFileLink = {
            path: resolvedPath,
            text: candidate.text,
            line: candidate.line,
            column: candidate.column
          }
          return {
            range: {
              start: { x: candidate.startIndex + 1, y: bufferLineNumber },
              end: { x: candidate.endIndex, y: bufferLineNumber }
            },
            text: candidate.text,
            activate: (event) => {
              if (isTerminalLinkActivation(event)) {
                options.openFile(link, event)
              }
            },
            hover: () => {
              if (tooltip) {
                tooltip.textContent =
                  options.hoverHint?.(link) ?? `${resolvedPath} (${getFileOpenHint()})`
                tooltip.style.display = ''
              }
            },
            leave: () => {
              if (tooltip) {
                tooltip.style.display = 'none'
              }
            }
          }
        })
      ).then((links) => {
        const resolved = links.filter((link): link is ILink => link !== null)
        callback(resolved.length > 0 ? resolved : undefined)
      })
    }
  }
}

function resolveFileLinkOptions(
  config: TerminalLinkOptions['fileLinks'],
  cwd: string | undefined
): TerminalFileLinkOptions | null {
  if (!config) {
    return null
  }
  if (config === true) {
    return cwd ? { cwd } : {}
  }
  return config.cwd === undefined && cwd !== undefined ? { ...config, cwd } : config
}

function parseFileLinkText(text: string): {
  displayText: string
  path: string
  line: number | null
  column: number | null
} | null {
  const displayText = text.replace(/[.,;]+$/g, '')
  if (!displayText || displayText === '.' || displayText === '..') {
    return null
  }

  const location = /^(.+?):(\d+)(?::(\d+))?$/.exec(displayText)
  if (location?.[1] && !/^[A-Za-z]$/.test(location[1])) {
    return {
      displayText,
      path: location[1],
      line: Number.parseInt(location[2] as string, 10),
      column: location[3] ? Number.parseInt(location[3], 10) : null
    }
  }

  return { displayText, path: displayText, line: null, column: null }
}

function resolveFilePath(text: string, cwd: string | undefined): string | null {
  if (isAbsoluteLikePath(text) || text.startsWith('~')) {
    return text
  }
  if (!cwd) {
    return text
  }
  const separator = cwd.includes('\\') ? '\\' : '/'
  return normalizeJoinedPath(cwd, text, separator)
}

function normalizeJoinedPath(cwd: string, relativePath: string, separator: string): string {
  const parts = cwd.split(/[\\/]+/)
  for (const part of relativePath.split(/[\\/]+/)) {
    if (!part || part === '.') {
      continue
    }
    if (part === '..') {
      if (parts.length > 1) {
        parts.pop()
      }
      continue
    }
    parts.push(part)
  }
  return parts.join(separator)
}

function isAbsoluteLikePath(text: string): boolean {
  return text.startsWith('/') || /^[A-Za-z]:[\\/]/.test(text)
}

function isTerminalLinkActivation(event: Pick<MouseEvent, 'metaKey' | 'ctrlKey'>): boolean {
  const isMac = globalThis.navigator?.userAgent.includes('Mac') ?? false
  return isMac ? Boolean(event.metaKey) : Boolean(event.ctrlKey)
}

function getUrlOpenHint(): string {
  return globalThis.navigator?.userAgent.includes('Mac')
    ? 'Cmd-click to open or Shift-Cmd-click for system browser'
    : 'Ctrl-click to open or Shift-Ctrl-click for system browser'
}

function getFileOpenHint(): string {
  return globalThis.navigator?.userAgent.includes('Mac') ? 'Cmd-click to open' : 'Ctrl-click to open'
}

function createLinkTooltip(terminal: Terminal): HTMLElement | null {
  const parent = terminal.element
  if (!parent) {
    return null
  }
  const tooltip = document.createElement('div')
  tooltip.className = 'webtui-link-tooltip xterm-hover'
  tooltip.style.cssText =
    'display:none;position:absolute;bottom:4px;left:8px;z-index:40;' +
    'padding:5px 8px;border-radius:4px;font-size:11px;font-family:inherit;' +
    'color:rgba(220,220,230,0.9);background:rgba(20,20,24,0.86);' +
    'border:1px solid rgba(255,255,255,0.16);pointer-events:none;' +
    'max-width:80%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'
  parent.appendChild(tooltip)
  return tooltip
}
