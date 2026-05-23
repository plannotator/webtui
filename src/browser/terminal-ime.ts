import type { Terminal } from '@xterm/xterm'

export function installTerminalImePositionFix(terminal: Terminal): () => void {
  if (!terminal.element || !terminal.textarea) {
    return () => undefined
  }

  const screenElement = terminal.element.querySelector<HTMLElement>('.xterm-screen')
  const textarea = terminal.textarea
  const handler = (): void => {
    syncTextareaToCursor({ terminal, screenElement, textarea })
  }

  terminal.element.addEventListener('compositionstart', handler, true)
  return () => {
    terminal.element?.removeEventListener('compositionstart', handler, true)
  }
}

export function syncTextareaToCursor(args: {
  terminal: Pick<Terminal, 'cols' | 'rows' | 'buffer'>
  screenElement: HTMLElement | null
  textarea: HTMLElement
}): boolean {
  const { terminal, screenElement, textarea } = args
  if (!screenElement) {
    return false
  }
  const rect = screenElement.getBoundingClientRect()
  const cellWidth = rect.width / terminal.cols
  const cellHeight = rect.height / terminal.rows
  if (!(cellWidth > 0) || !(cellHeight > 0)) {
    return false
  }
  const buffer = terminal.buffer.active
  const x = Math.min(buffer.cursorX, terminal.cols - 1)
  textarea.style.top = `${buffer.cursorY * cellHeight}px`
  textarea.style.left = `${x * cellWidth}px`
  return true
}
