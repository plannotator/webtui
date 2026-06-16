import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createAgentPasteQueue,
  createAgentPasteReadinessTracker,
  pasteWhenAgentReady,
  submitBracketedPasteToAgent
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

  it('submits immediate bracketed paste with a delayed Enter', async () => {
    const pty = createPtySession()
    const pasted = submitBracketedPasteToAgent({
      pty,
      content: 'runtime prompt',
      submit: true
    })

    expect(pty.writes).toEqual([createBracketedPastePayload('runtime prompt')])
    await vi.advanceTimersByTimeAsync(49)
    expect(pty.writes).toEqual([createBracketedPastePayload('runtime prompt')])

    await vi.advanceTimersByTimeAsync(1)
    await expect(pasted).resolves.toBe(true)
    expect(pty.writes).toEqual([createBracketedPastePayload('runtime prompt'), '\r'])
  })

  it('falls back to process readiness when paste readiness times out', async () => {
    const pty = createPtySession({
      getForegroundProcess: () => Promise.resolve('codex')
    })
    const tracker = createAgentPasteReadinessTracker(pty)
    const pasted = pasteWhenAgentReady({
      pty,
      tracker,
      content: 'launch followup',
      submit: true,
      timeoutMs: 20,
      expectedProcess: 'codex',
      getTitle: () => ''
    })

    await vi.advanceTimersByTimeAsync(20)
    await vi.advanceTimersByTimeAsync(50)

    await expect(pasted).resolves.toBe(true)
    expect(pty.writes).toEqual([createBracketedPastePayload('launch followup'), '\r'])
    tracker.dispose()
  })

  it('serializes concurrent bracketed pastes through one queue', async () => {
    const pty = createPtySession()
    const queue = createAgentPasteQueue()
    const first = submitBracketedPasteToAgent({
      pty,
      content: 'first',
      submit: true,
      queue
    })
    const second = submitBracketedPasteToAgent({
      pty,
      content: 'second',
      submit: true,
      queue
    })

    await Promise.resolve()
    expect(pty.writes).toEqual([createBracketedPastePayload('first')])

    await vi.advanceTimersByTimeAsync(50)
    expect(pty.writes).toEqual([
      createBracketedPastePayload('first'),
      '\r',
      createBracketedPastePayload('second')
    ])

    await vi.advanceTimersByTimeAsync(50)
    await expect(first).resolves.toBe(true)
    await expect(second).resolves.toBe(true)
    expect(pty.writes).toEqual([
      createBracketedPastePayload('first'),
      '\r',
      createBracketedPastePayload('second'),
      '\r'
    ])
  })
})

function createPtySession(overrides: Partial<PtySession> = {}): PtySession & {
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
    onExit: () => () => undefined,
    ...overrides
  }
}
