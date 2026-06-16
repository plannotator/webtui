import { describe, expect, it } from 'vitest'

import {
  buildAgentLaunchPlan,
  BUILT_IN_AGENTS,
  listBuiltInAgents,
  resolveAgentConfig,
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
    expect(codexPlan.preflightTrust).toBe('codex')
    expect(codexPlan.draftPasteReadySignal).toBe('codex-composer-prompt')
  })

  it('matches Orca command names for existing built-in agents', () => {
    expect(BUILT_IN_AGENTS.continue).toMatchObject({
      detectCommand: 'cn',
      launchCommand: 'cn',
      expectedProcess: 'cn'
    })
    expect(BUILT_IN_AGENTS['mistral-vibe']).toMatchObject({
      detectCommand: 'vibe',
      launchCommand: 'vibe',
      expectedProcess: 'vibe'
    })
    expect(BUILT_IN_AGENTS.hermes.launchCommand).toBe('hermes --tui')
    expect(BUILT_IN_AGENTS.kiro.launchCommand).toBe('kiro-cli chat --tui')
  })

  it('resolves portable Orca agents', () => {
    expect(resolveAgentConfig('devin')).toMatchObject({
      detectCommand: 'devin',
      launchCommand: 'devin',
      expectedProcess: 'devin',
      promptInjectionMode: 'stdin-after-start'
    })
    expect(resolveAgentConfig('grok')).toMatchObject({
      detectCommand: 'grok',
      launchCommand: 'grok',
      expectedProcess: 'grok',
      promptInjectionMode: 'stdin-after-start'
    })
    expect(resolveAgentConfig('openclaude')).toMatchObject({
      detectCommand: 'openclaude',
      launchCommand: 'openclaude',
      expectedProcess: 'openclaude',
      promptInjectionMode: 'argv'
    })
    expect(resolveAgentConfig('openclaw')).toMatchObject({
      detectCommand: 'openclaw',
      launchCommand: 'openclaw',
      expectedProcess: 'openclaw',
      promptInjectionMode: 'stdin-after-start'
    })
    expect(resolveAgentConfig('antigravity')).toMatchObject({
      detectCommand: 'agy',
      launchCommand: 'agy',
      expectedProcess: 'agy',
      promptInjectionMode: 'flag-prompt-interactive'
    })
    expect(resolveAgentConfig('command-code')).toMatchObject({
      detectCommand: 'command-code',
      launchCommand: 'command-code --trust',
      expectedProcess: 'command-code',
      promptInjectionMode: 'argv'
    })
  })

  it('builds launch plans for new portable Orca agents', () => {
    const devinPlan = buildAgentLaunchPlan({
      agent: 'devin',
      prompt: { text: 'inspect the repo' },
      platform: 'linux'
    })
    const openClaudePlan = buildAgentLaunchPlan({
      agent: 'openclaude',
      prompt: { text: 'inspect the repo' },
      platform: 'linux'
    })

    expect(devinPlan.command).toBe('devin')
    expect(devinPlan.followupPrompt).toBe('inspect the repo')
    expect(devinPlan.promptDelivery).toBe('stdin-after-start')
    expect(openClaudePlan.command).toBe("openclaude 'inspect the repo'")
    expect(openClaudePlan.followupPrompt).toBeNull()
    expect(openClaudePlan.promptDelivery).toBe('argv')
  })
})
