import { describe, expect, it } from 'vitest'

import {
  buildAgentLaunchPlan,
  BUILT_IN_AGENTS,
  listBuiltInAgents,
  type AgentConfig
} from '../src/core/index.js'

describe('agent launch planning', () => {
  it('lists built-in TUI agents', () => {
    expect(listBuiltInAgents()).toContain('claude')
    expect(listBuiltInAgents()).toContain('codex')
    expect(listBuiltInAgents()).toContain('opencode')
    expect(listBuiltInAgents()).toContain('copilot')
  })

  it('builds argv submit commands', () => {
    const plan = buildAgentLaunchPlan({
      agent: 'codex',
      prompt: { text: 'fix tests' },
      platform: 'linux'
    })

    expect(plan.command).toBe("codex 'fix tests'")
    expect(plan.followupPrompt).toBeNull()
    expect(plan.promptDelivery).toBe('argv')
  })

  it('builds flag submit commands', () => {
    const plan = buildAgentLaunchPlan({
      agent: 'gemini',
      prompt: { text: 'hello' },
      platform: 'linux'
    })

    expect(plan.command).toBe("gemini --prompt-interactive 'hello'")
    expect(plan.promptDelivery).toBe('flag-prompt-interactive')
  })

  it('uses followup prompt for stdin-after-start agents', () => {
    const plan = buildAgentLaunchPlan({
      agent: 'aider',
      prompt: { text: 'summarize diff' },
      platform: 'linux'
    })

    expect(plan.command).toBe('aider')
    expect(plan.followupPrompt).toBe('summarize diff')
    expect(plan.promptDelivery).toBe('stdin-after-start')
  })

  it('supports custom agents', () => {
    const custom: AgentConfig = {
      detectCommand: 'acme-agent',
      launchCommand: 'acme-agent',
      expectedProcess: 'acme-agent',
      promptInjectionMode: 'flag-prompt'
    }

    const plan = buildAgentLaunchPlan({
      agent: 'acme',
      customAgents: { acme: custom },
      prompt: { text: 'ship it' },
      platform: 'linux'
    })

    expect(plan.command).toBe("acme-agent --prompt 'ship it'")
  })

  it('keeps catalog configs immutable by callers', () => {
    expect(BUILT_IN_AGENTS.cursor.preflightTrust).toBe('cursor')
  })

  it('carries optional trust preflight metadata into launch plans', () => {
    const cursorPlan = buildAgentLaunchPlan({
      agent: 'cursor',
      prompt: null,
      allowEmptyPromptLaunch: true
    })
    const codexPlan = buildAgentLaunchPlan({
      agent: 'codex',
      prompt: null,
      allowEmptyPromptLaunch: true
    })

    expect(cursorPlan.preflightTrust).toBe('cursor')
    expect(codexPlan.preflightTrust).toBeNull()
  })
})
