import { describe, expect, it } from 'vitest'

import { waitForAgentReady } from '../src/browser/index.js'
import type { PtySession } from '../src/core/index.js'

describe('agent readiness', () => {
  it('uses idle terminal titles as a readiness signal', async () => {
    const result = await waitForAgentReady({
      pty: createPtySession(),
      expectedProcess: 'claude',
      getTitle: () => '\u2733 Saut\u00e9ed for 2s',
      options: { fallbackDelayMs: 5, pollIntervalMs: 1 }
    })

    expect(result).toEqual({ ready: true, reason: 'title-idle' })
  })

  it('recognizes expected foreground process names', async () => {
    let calls = 0
    const result = await waitForAgentReady({
      pty: createPtySession({
        getForegroundProcess: () => {
          calls += 1
          return Promise.resolve(calls === 1 ? 'zsh' : '/usr/local/bin/codex')
        }
      }),
      expectedProcess: 'codex',
      options: { timeoutMs: 80, pollIntervalMs: 1 }
    })

    expect(result).toEqual({ ready: true, reason: 'foreground-match' })
  })

  it('falls back to shell child-process detection after startup settles', async () => {
    const result = await waitForAgentReady({
      pty: createPtySession({
        getForegroundProcess: () => Promise.resolve('zsh'),
        hasChildProcesses: () => Promise.resolve(true)
      }),
      expectedProcess: 'aider',
      options: { timeoutMs: 80, pollIntervalMs: 1 }
    })

    expect(result).toEqual({ ready: true, reason: 'child-process' })
  })

  it('returns timeout when no readiness signal appears', async () => {
    const result = await waitForAgentReady({
      pty: createPtySession(),
      expectedProcess: 'goose',
      options: { fallbackDelayMs: 2, pollIntervalMs: 1 }
    })

    expect(result).toEqual({ ready: false, reason: 'timeout' })
  })
})

function createPtySession(overrides: Partial<PtySession> = {}): PtySession {
  return {
    id: 'test',
    write: () => undefined,
    resize: () => undefined,
    kill: () => undefined,
    onData: () => () => undefined,
    onExit: () => () => undefined,
    ...overrides
  }
}
