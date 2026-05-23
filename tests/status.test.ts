import { describe, expect, it } from 'vitest'

import {
  createAgentStatusOscProcessor,
  detectAgentStatusFromTitle,
  extractAllOscTitles,
  parseAgentStatusPayload
} from '../src/core/index.js'

describe('agent status parsing', () => {
  it('detects common title statuses', () => {
    expect(detectAgentStatusFromTitle('Codex working')).toBe('working')
    expect(detectAgentStatusFromTitle('OpenCode ready')).toBe('idle')
    expect(detectAgentStatusFromTitle('Gemini waiting for input')).toBe('permission')
    expect(detectAgentStatusFromTitle('Cursor Agent')).toBeNull()
  })

  it('extracts all OSC titles in order', () => {
    expect(extractAllOscTitles('\x1b]0;Codex working\x07body\x1b]0;Codex done\x07')).toEqual([
      'Codex working',
      'Codex done'
    ])
  })

  it('normalizes explicit status payloads', () => {
    expect(
      parseAgentStatusPayload(
        JSON.stringify({
          state: 'working',
          prompt: '  hello\nworld  ',
          agentType: 'codex',
          toolName: 'Shell'
        })
      )
    ).toMatchObject({
      state: 'working',
      prompt: 'hello world',
      agentType: 'codex',
      toolName: 'Shell'
    })
  })

  it('processes split OSC 9999 payloads without leaking control bytes', () => {
    const process = createAgentStatusOscProcessor()
    const first = process('before \x1b]9999;{"state":"done"')
    const second = process(',"prompt":"ok"}\x07 after')

    expect(first).toEqual({ cleanData: 'before ', payloads: [] })
    expect(second.cleanData).toBe(' after')
    expect(second.payloads).toEqual([{ state: 'done', prompt: 'ok' }])
  })
})
