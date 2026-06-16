import { describe, expect, it } from 'vitest'

import {
  createAgentStatusOscProcessor,
  detectAgentStatusFromTitle,
  extractAllOscTitles,
  parseAgentStatusPayload,
  titleHasAgentName
} from '../src/core/index.js'

describe('agent status parsing', () => {
  it('detects common title statuses', () => {
    expect(detectAgentStatusFromTitle('Codex working')).toBe('working')
    expect(detectAgentStatusFromTitle('OpenCode ready')).toBe('idle')
    expect(detectAgentStatusFromTitle('Gemini waiting for input')).toBe('permission')
    expect(detectAgentStatusFromTitle('Cursor Agent')).toBeNull()
  })

  it('matches agent names as title tokens, not substrings', () => {
    expect(detectAgentStatusFromTitle('opencode-blinker')).toBeNull()
    expect(detectAgentStatusFromTitle('claude-scratch')).toBeNull()
    expect(detectAgentStatusFromTitle('~/projects/codex-scratch')).toBeNull()
    expect(detectAgentStatusFromTitle('OpenCode ready')).toBe('idle')
    expect(detectAgentStatusFromTitle('openclaude running')).toBe('working')
  })

  it('rejects status keywords inside path fragments and larger words', () => {
    expect(detectAgentStatusFromTitle('~/codex/working')).not.toBe('working')
    expect(detectAgentStatusFromTitle('C:\\aider\\thinking')).not.toBe('working')
    expect(detectAgentStatusFromTitle('codex.working')).not.toBe('working')
    expect(detectAgentStatusFromTitle('~/codex already built')).toBeNull()
    expect(detectAgentStatusFromTitle('timestamp ready')).toBeNull()
    expect(detectAgentStatusFromTitle('Codex working.')).toBe('working')
    expect(detectAgentStatusFromTitle('Aider idle!')).toBe('idle')
  })

  it('handles newer Orca title cases without broad substring matches', () => {
    expect(detectAgentStatusFromTitle('claude agents')).toBeNull()
    expect(detectAgentStatusFromTitle('claude.exe agents')).toBeNull()
    expect(
      detectAgentStatusFromTitle('C:\\Users\\dev\\AppData\\Roaming\\npm\\claude.cmd agents')
    ).toBeNull()
    expect(detectAgentStatusFromTitle('claude agents working')).toBe('working')
    expect(detectAgentStatusFromTitle('agy working')).toBe('working')
    expect(detectAgentStatusFromTitle('⠋ Droid')).toBe('working')
    expect(detectAgentStatusFromTitle('Droid ready')).toBe('idle')
    expect(detectAgentStatusFromTitle('Factory Droid needs input')).toBeNull()
    expect(detectAgentStatusFromTitle('android build working')).toBeNull()
    expect(detectAgentStatusFromTitle('Hermes - action required')).toBe('permission')
    expect(detectAgentStatusFromTitle('~/hermes/working')).not.toBe('working')
  })

  it('allows Windows launcher suffixes for token-matched agent names', () => {
    expect(titleHasAgentName('openclaude.exe ready', 'openclaude')).toBe(true)
    expect(titleHasAgentName('C:\\tools\\openclaude.exe ready', 'openclaude')).toBe(false)
    expect(detectAgentStatusFromTitle('codex.cmd ready')).toBe('idle')
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
