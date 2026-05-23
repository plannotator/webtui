import { describe, expect, it, vi } from 'vitest'

import {
  createShellReadyScanState,
  scanForShellReady,
  writeStartupCommand
} from '../src/server/index.js'

describe('local shell-ready startup', () => {
  it('strips split shell-ready markers from terminal output', () => {
    const state = createShellReadyScanState()
    const first = scanForShellReady(state, 'prompt \x1b]133')
    const second = scanForShellReady(state, ';A\x07 after')

    expect(first).toEqual({ output: 'prompt ', matched: false })
    expect(second).toEqual({ output: ' after', matched: true })
  })

  it('releases partial marker bytes when the sequence does not match', () => {
    const state = createShellReadyScanState()
    const result = scanForShellReady(state, '\x1b]999;noise')

    expect(result).toEqual({ output: '\x1b]999;noise', matched: false })
  })

  it('submits startup commands with the platform newline', () => {
    const write = vi.fn()
    const proc = { write } as unknown as Parameters<typeof writeStartupCommand>[0]

    writeStartupCommand(proc, 'codex')

    expect(write).toHaveBeenCalledWith(`codex${process.platform === 'win32' ? '\r' : '\n'}`)
  })
})
