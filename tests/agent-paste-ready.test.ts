import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createAgentPasteReadinessTracker,
  pasteWhenAgentReady
} from '../src/browser/index.js'
import {
  createBracketedPastePayload,
  DECSET_BRACKETED_PASTE,
  type PtySession,
  type Unsubscribe
} from '../src/core/index.js'

describe('paste when agent ready', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('waits for DECSET bracketed paste and a quiet render window', async () => {
    const pty = createPtySession()
    const tracker = createAgentPasteReadinessTracker(pty)
    const pasted = pasteWhenAgentReady({
      pty,
      tracker,
      content: 'hello',
      submit: false,
      quietMs: 1500,
      timeoutMs: 5000
    })

    pty.emit(`${DECSET_BRACKETED_PASTE}rendering`)
    await vi.advanceTimersByTimeAsync(1499)
    expect(pty.writes).toEqual([])

    await vi.advanceTimersByTimeAsync(1)
    await expect(pasted).resolves.toBe(true)
    expect(pty.writes).toEqual([createBracketedPastePayload('hello')])
    tracker.dispose()
  })

  it('resets the quiet window on post-handshake output', async () => {
    const pty = createPtySession()
    const tracker = createAgentPasteReadinessTracker(pty)
    const pasted = pasteWhenAgentReady({
      pty,
      tracker,
      content: 'hello',
      submit: false,
      quietMs: 1500,
      timeoutMs: 5000
    })

    pty.emit(DECSET_BRACKETED_PASTE)
    await vi.advanceTimersByTimeAsync(1000)
    pty.emit('more output')
    await vi.advanceTimersByTimeAsync(1000)
    expect(pty.writes).toEqual([])

    await vi.advanceTimersByTimeAsync(500)
    await expect(pasted).resolves.toBe(true)
    expect(pty.writes).toEqual([createBracketedPastePayload('hello')])
    tracker.dispose()
  })

  it('uses Codex composer prompt as a readiness signal after DECSET', async () => {
    const pty = createPtySession()
    const tracker = createAgentPasteReadinessTracker(pty)
    const pasted = pasteWhenAgentReady({
      pty,
      tracker,
      content: 'fix tests',
      readySignal: 'codex-composer-prompt',
      submit: true,
      submitDelayMs: 50,
      timeoutMs: 5000
    })

    pty.emit(DECSET_BRACKETED_PASTE.slice(0, 4))
    pty.emit(`${DECSET_BRACKETED_PASTE.slice(4)}\x1b[38;5;8m›\x1b[0m`)
    await vi.advanceTimersByTimeAsync(60)

    await expect(pasted).resolves.toBe(true)
    expect(pty.writes).toEqual([createBracketedPastePayload('fix tests'), '\r'])
    tracker.dispose()
  })
})

function createPtySession(): PtySession & {
  writes: string[]
  emit(data: string): void
} {
  const listeners = new Set<(data: string) => void>()
  const writes: string[] = []
  return {
    id: 'test',
    writes,
    emit(data: string): void {
      for (const listener of listeners) {
        listener(data)
      }
    },
    write(data: string): void {
      writes.push(data)
    },
    resize: () => undefined,
    kill: () => undefined,
    onData(callback: (data: string) => void): Unsubscribe {
      listeners.add(callback)
      return () => listeners.delete(callback)
    },
    onExit: () => () => undefined
  }
}
