import { describe, expect, it } from 'vitest'

import {
  terminalOutputPrefersRenderRefresh,
  terminalOutputRequiresDomRenderer
} from '../src/browser/index.js'

describe('terminal rendering policy', () => {
  it('keeps box drawing on the WebGL/custom glyph path', () => {
    expect(terminalOutputPrefersRenderRefresh('┌────┐\n│ ok │\n└────┘')).toBe(false)
  })

  it('refreshes instead of falling back to DOM rendering for complex shaping scripts', () => {
    expect(terminalOutputPrefersRenderRefresh('Arabic: السلام عليكم')).toBe(true)
    expect(terminalOutputRequiresDomRenderer('Arabic: السلام عليكم')).toBe(false)
  })
})
