import { describe, expect, it } from 'vitest'

import { terminalOutputRequiresDomRenderer } from '../src/browser/index.js'

describe('terminal rendering policy', () => {
  it('keeps box drawing on the WebGL/custom glyph path', () => {
    expect(terminalOutputRequiresDomRenderer('┌────┐\n│ ok │\n└────┘')).toBe(false)
  })

  it('falls back to DOM rendering for complex shaping scripts', () => {
    expect(terminalOutputRequiresDomRenderer('Arabic: السلام عليكم')).toBe(true)
  })
})
