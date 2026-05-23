import { describe, expect, it } from 'vitest'

import { syncTextareaToCursor } from '../src/browser/index.js'

describe('terminal IME positioning', () => {
  it('moves the hidden textarea to the cursor cell', () => {
    const textarea = { style: { top: '', left: '' } }
    const screenElement = {
      getBoundingClientRect: () => ({ width: 100, height: 80 })
    }
    const terminal = {
      cols: 10,
      rows: 4,
      buffer: {
        active: {
          cursorX: 3,
          cursorY: 2
        }
      }
    }

    const didSync = syncTextareaToCursor({
      terminal: terminal as Parameters<typeof syncTextareaToCursor>[0]['terminal'],
      screenElement: screenElement as HTMLElement,
      textarea: textarea as unknown as HTMLElement
    })

    expect(didSync).toBe(true)
    expect(textarea.style.left).toBe('30px')
    expect(textarea.style.top).toBe('40px')
  })
})
