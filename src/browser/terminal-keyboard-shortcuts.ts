import type { Terminal } from '@xterm/xterm'

import type { PtySession } from '../core/index.js'
import type { TerminalFontZoomController } from './terminal-font-zoom.js'

const SHIFT_ENTER_NEWLINE_SEQUENCE = '\x1b[13;2u'

export function handleTerminalKeyboardShortcut(
  event: KeyboardEvent,
  terminal: Terminal,
  pty: PtySession,
  fontZoom: TerminalFontZoomController
): boolean {
  if (fontZoom.handleKeyboardEvent(event)) {
    return false
  }

  if (isShiftEnter(event)) {
    event.preventDefault()
    event.stopPropagation()
    pty.write(SHIFT_ENTER_NEWLINE_SEQUENCE)
    return false
  }

  const isMac = globalThis.navigator?.userAgent.includes('Mac') ?? false
  const mod = isMac ? event.metaKey : event.ctrlKey
  if (!mod || event.type !== 'keydown') {
    return true
  }

  const key = event.key.toLowerCase()
  if (key === 'c' && terminal.hasSelection()) {
    const selection = terminal.getSelection()
    if (selection && globalThis.navigator?.clipboard) {
      void globalThis.navigator.clipboard.writeText(selection)
    }
    return false
  }
  if (key === 'v' && globalThis.navigator?.clipboard?.readText) {
    // Why: browsers do not consistently deliver native paste to xterm's hidden
    // textarea after our custom key handler runs. Own Cmd/Ctrl+V here, but
    // cancel the native path first so the same clipboard payload cannot land
    // twice when the browser does dispatch a paste event.
    event.preventDefault()
    event.stopPropagation()
    void globalThis.navigator.clipboard.readText().then((text) => {
      if (text) {
        terminal.paste(text)
      }
    })
    return false
  }
  if (key === 'k') {
    terminal.clear()
    return false
  }
  return true
}

function isShiftEnter(event: KeyboardEvent): boolean {
  return (
    event.type === 'keydown' &&
    event.key === 'Enter' &&
    event.shiftKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey
  )
}
