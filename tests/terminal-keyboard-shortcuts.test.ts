import { afterEach, describe, expect, it, vi } from 'vitest'

import { handleTerminalKeyboardShortcut } from '../src/browser/index.js'

describe('terminal keyboard shortcuts', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('routes Shift+Enter as a modified Enter sequence for multiline agent prompts', () => {
    const write = vi.fn()
    const preventDefault = vi.fn()
    const stopPropagation = vi.fn()

    const result = handleTerminalKeyboardShortcut(
      {
        type: 'keydown',
        key: 'Enter',
        shiftKey: true,
        preventDefault,
        stopPropagation
      } as unknown as KeyboardEvent,
      {
        hasSelection: () => false,
        getSelection: () => '',
        clear: vi.fn(),
        paste: vi.fn()
      } as never,
      { write } as never,
      { handleKeyboardEvent: () => false } as never
    )

    expect(result).toBe(false)
    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(stopPropagation).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledWith('\x1b[13;2u')
  })

  it('leaves modified Shift+Enter combinations to xterm', () => {
    const write = vi.fn()

    const result = handleTerminalKeyboardShortcut(
      {
        type: 'keydown',
        key: 'Enter',
        shiftKey: true,
        ctrlKey: true
      } as unknown as KeyboardEvent,
      {
        hasSelection: () => false,
        getSelection: () => '',
        clear: vi.fn(),
        paste: vi.fn()
      } as never,
      { write } as never,
      { handleKeyboardEvent: () => false } as never
    )

    expect(result).toBe(true)
    expect(write).not.toHaveBeenCalled()
  })

  it('owns Cmd/Ctrl+V once and routes the payload through xterm paste', async () => {
    const readText = vi.fn().mockResolvedValue('pasted text')
    const write = vi.fn()
    const paste = vi.fn()
    const preventDefault = vi.fn()
    const stopPropagation = vi.fn()
    vi.stubGlobal('navigator', {
      userAgent: 'Linux',
      clipboard: { readText }
    })

    const result = handleTerminalKeyboardShortcut(
      {
        type: 'keydown',
        key: 'v',
        ctrlKey: true,
        preventDefault,
        stopPropagation
      } as unknown as KeyboardEvent,
      {
        hasSelection: () => false,
        getSelection: () => '',
        clear: vi.fn(),
        paste
      } as never,
      { write } as never,
      { handleKeyboardEvent: () => false } as never
    )

    expect(result).toBe(false)
    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(stopPropagation).toHaveBeenCalledTimes(1)
    expect(write).not.toHaveBeenCalled()
    await Promise.resolve()
    expect(readText).toHaveBeenCalledTimes(1)
    expect(paste).toHaveBeenCalledWith('pasted text')
  })
})
