import type { Terminal } from '@xterm/xterm'

export type ForegroundTerminalOutputTarget = Pick<Terminal, 'buffer' | 'refresh' | 'rows' | 'write'> & {
  _core?: {
    refresh?(start: number, end: number, sync?: boolean): void
  }
}

type ForegroundTerminalWriteOptions = {
  forceViewportRefresh?: boolean
  followupViewportRefresh?: boolean
  onParsed?: () => void
}

type ScheduledViewportRefresh = { kind: 'raf'; id: number } | { kind: 'timeout'; id: ReturnType<typeof setTimeout> }

type ViewportSnapshot = {
  baseY: number | null
  viewportY: number | null
}

const pendingViewportRefreshByTerminal = new WeakMap<
  ForegroundTerminalOutputTarget,
  ScheduledViewportRefresh
>()

function refreshVisibleRowsNow(terminal: ForegroundTerminalOutputTarget): void {
  if (terminal.rows < 1) {
    return
  }

  const start = 0
  const end = Math.max(0, terminal.rows - 1)
  try {
    // xterm's private sync refresh avoids a one-frame stale glyph/fill mismatch
    // after ANSI panel rewrites while keeping WebGL attached.
    if (typeof terminal._core?.refresh === 'function') {
      terminal._core.refresh(start, end, true)
      return
    }
    terminal.refresh(start, end)
  } catch {
    // PTY output can race terminal teardown.
  }
}

function captureViewportSnapshot(terminal: ForegroundTerminalOutputTarget): ViewportSnapshot {
  return {
    baseY:
      typeof terminal.buffer.active.baseY === 'number' ? terminal.buffer.active.baseY : null,
    viewportY:
      typeof terminal.buffer.active.viewportY === 'number'
        ? terminal.buffer.active.viewportY
        : null
  }
}

function viewportChangedDuringWrite(
  terminal: ForegroundTerminalOutputTarget,
  beforeWrite: ViewportSnapshot
): boolean {
  const afterWrite = captureViewportSnapshot(terminal)
  return (
    afterWrite.baseY !== null &&
    afterWrite.viewportY !== null &&
    (afterWrite.baseY !== beforeWrite.baseY || afterWrite.viewportY !== beforeWrite.viewportY)
  )
}

function cancelScheduledViewportRefresh(terminal: ForegroundTerminalOutputTarget): void {
  const pending = pendingViewportRefreshByTerminal.get(terminal)
  if (!pending) {
    return
  }
  pendingViewportRefreshByTerminal.delete(terminal)
  if (pending.kind === 'raf') {
    globalThis.cancelAnimationFrame?.(pending.id)
    return
  }
  clearTimeout(pending.id)
}

function scheduleViewportRefresh(terminal: ForegroundTerminalOutputTarget): void {
  cancelScheduledViewportRefresh(terminal)
  if (typeof globalThis.requestAnimationFrame === 'function') {
    const id = globalThis.requestAnimationFrame(() => {
      pendingViewportRefreshByTerminal.delete(terminal)
      refreshVisibleRowsNow(terminal)
    })
    pendingViewportRefreshByTerminal.set(terminal, { kind: 'raf', id })
    return
  }

  const id = setTimeout(() => {
    pendingViewportRefreshByTerminal.delete(terminal)
    refreshVisibleRowsNow(terminal)
  }, 16)
  pendingViewportRefreshByTerminal.set(terminal, { kind: 'timeout', id })
}

function settleForegroundRender(
  terminal: ForegroundTerminalOutputTarget,
  beforeWriteViewport: ViewportSnapshot,
  options: ForegroundTerminalWriteOptions
): void {
  refreshVisibleRowsNow(terminal)
  if (
    options.followupViewportRefresh ||
    viewportChangedDuringWrite(terminal, beforeWriteViewport)
  ) {
    scheduleViewportRefresh(terminal)
  }
}

export function writeForegroundTerminalChunk(
  terminal: ForegroundTerminalOutputTarget,
  data: string,
  options: ForegroundTerminalWriteOptions = {}
): void {
  const beforeWriteViewport = options.forceViewportRefresh
    ? captureViewportSnapshot(terminal)
    : null

  try {
    terminal.write(data, () => {
      if (beforeWriteViewport) {
        settleForegroundRender(terminal, beforeWriteViewport, options)
      }
      options.onParsed?.()
    })
  } catch {
    if (beforeWriteViewport) {
      settleForegroundRender(terminal, beforeWriteViewport, options)
    }
    options.onParsed?.()
  }
}

export function discardForegroundRenderSettle(terminal: ForegroundTerminalOutputTarget): void {
  cancelScheduledViewportRefresh(terminal)
}
