import { describe, expect, it } from 'vitest'

import {
  getNextTerminalFontSize,
  resolveTerminalFontZoomOptions,
  resolveTerminalFontZoomShortcut
} from '../src/browser/index.js'

describe('terminal font zoom', () => {
  it('uses platform primary modifiers for zoom shortcuts', () => {
    expect(
      resolveTerminalFontZoomShortcut(
        { type: 'keydown', key: '=', code: 'Equal', metaKey: true },
        true
      )
    ).toBe('in')
    expect(
      resolveTerminalFontZoomShortcut(
        { type: 'keydown', key: '-', code: 'Minus', ctrlKey: true },
        false
      )
    ).toBe('out')
    expect(
      resolveTerminalFontZoomShortcut(
        { type: 'keydown', key: '0', code: 'Digit0', ctrlKey: true },
        false
      )
    ).toBe('reset')
  })

  it('accepts shifted and numpad zoom variants', () => {
    expect(
      resolveTerminalFontZoomShortcut(
        { type: 'keydown', key: '+', code: 'Equal', metaKey: true, shiftKey: true },
        true
      )
    ).toBe('in')
    expect(
      resolveTerminalFontZoomShortcut(
        { type: 'keydown', key: '_', code: 'Minus', metaKey: true, shiftKey: true },
        true
      )
    ).toBe('out')
    expect(
      resolveTerminalFontZoomShortcut(
        { type: 'keydown', key: '+', code: 'NumpadAdd', ctrlKey: true },
        false
      )
    ).toBe('in')
    expect(
      resolveTerminalFontZoomShortcut(
        { type: 'keydown', key: '-', code: 'NumpadSubtract', ctrlKey: true },
        false
      )
    ).toBe('out')
  })

  it('does not steal opposite-modifier or alt chords', () => {
    expect(
      resolveTerminalFontZoomShortcut(
        { type: 'keydown', key: '=', code: 'Equal', ctrlKey: true },
        true
      )
    ).toBeNull()
    expect(
      resolveTerminalFontZoomShortcut(
        { type: 'keydown', key: '=', code: 'Equal', ctrlKey: true, altKey: true },
        false
      )
    ).toBeNull()
    expect(
      resolveTerminalFontZoomShortcut(
        { type: 'keyup', key: '=', code: 'Equal', metaKey: true },
        true
      )
    ).toBeNull()
  })

  it('resolves sane defaults around the initial terminal font size', () => {
    expect(resolveTerminalFontZoomOptions(true, 15)).toEqual({
      enabled: true,
      min: 8,
      max: 32,
      step: 1,
      defaultSize: 15
    })
    expect(resolveTerminalFontZoomOptions(undefined, 14).enabled).toBe(false)
  })

  it('clamps zoom math to configured bounds and resets to the default size', () => {
    const options = resolveTerminalFontZoomOptions(
      { enabled: true, min: 10, max: 16, step: 2, defaultSize: 13 },
      14
    )

    expect(getNextTerminalFontSize(15, 'in', options)).toBe(16)
    expect(getNextTerminalFontSize(11, 'out', options)).toBe(10)
    expect(getNextTerminalFontSize(16, 'reset', options)).toBe(13)
  })
})
