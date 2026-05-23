import type { AgentConfigMap, AgentPreflightTrust, AgentPromptInjectionMode } from './agents.js'
import { resolveAgentConfig } from './agents.js'
import { quoteCommandArgument, type HostPlatform } from './shell-quote.js'

export type AgentPrompt = {
  text: string
}

export type AgentLaunchPlan = {
  agent: string
  command: string
  expectedProcess: string
  env: Record<string, string>
  followupPrompt: string | null
  promptInjectionMode: AgentPromptInjectionMode
  preflightTrust: AgentPreflightTrust | null
  promptDelivery:
    | 'none'
    | 'argv'
    | 'flag-prompt'
    | 'flag-prompt-interactive'
    | 'flag-interactive'
    | 'stdin-after-start'
}

export type BuildAgentLaunchPlanOptions = {
  agent: string
  prompt?: AgentPrompt | null
  customAgents?: AgentConfigMap
  commandOverrides?: Record<string, string>
  platform?: HostPlatform
  allowEmptyPromptLaunch?: boolean
}

export function buildAgentLaunchPlan(options: BuildAgentLaunchPlanOptions): AgentLaunchPlan {
  const platform = options.platform ?? resolveRuntimePlatform()
  const config = resolveAgentConfig(options.agent, options.customAgents)
  if (!config) {
    throw new Error(`Unknown agent: ${options.agent}`)
  }

  const command = options.commandOverrides?.[options.agent] ?? config.launchCommand
  const promptText = options.prompt?.text.trim() ?? ''
  if (!promptText) {
    if (options.prompt && !options.allowEmptyPromptLaunch) {
      throw new Error('Prompt text is empty')
    }
    return basePlan({
      agent: options.agent,
      command,
      expectedProcess: config.expectedProcess,
      promptInjectionMode: config.promptInjectionMode,
      preflightTrust: config.preflightTrust ?? null,
      promptDelivery: 'none'
    })
  }

  const quoted = quoteCommandArgument(promptText, platform)
  if (config.promptInjectionMode === 'argv') {
    return basePlan({
      agent: options.agent,
      command: `${command} ${quoted}`,
      expectedProcess: config.expectedProcess,
      promptInjectionMode: config.promptInjectionMode,
      preflightTrust: config.preflightTrust ?? null,
      promptDelivery: 'argv'
    })
  }

  if (config.promptInjectionMode === 'flag-prompt') {
    return basePlan({
      agent: options.agent,
      command: `${command} --prompt ${quoted}`,
      expectedProcess: config.expectedProcess,
      promptInjectionMode: config.promptInjectionMode,
      preflightTrust: config.preflightTrust ?? null,
      promptDelivery: 'flag-prompt'
    })
  }

  if (config.promptInjectionMode === 'flag-prompt-interactive') {
    return basePlan({
      agent: options.agent,
      command: `${command} --prompt-interactive ${quoted}`,
      expectedProcess: config.expectedProcess,
      promptInjectionMode: config.promptInjectionMode,
      preflightTrust: config.preflightTrust ?? null,
      promptDelivery: 'flag-prompt-interactive'
    })
  }

  if (config.promptInjectionMode === 'flag-interactive') {
    return basePlan({
      agent: options.agent,
      command: `${command} -i ${quoted}`,
      expectedProcess: config.expectedProcess,
      promptInjectionMode: config.promptInjectionMode,
      preflightTrust: config.preflightTrust ?? null,
      promptDelivery: 'flag-interactive'
    })
  }

  return basePlan({
    agent: options.agent,
    command,
    expectedProcess: config.expectedProcess,
    followupPrompt: promptText,
    promptInjectionMode: config.promptInjectionMode,
    preflightTrust: config.preflightTrust ?? null,
    promptDelivery: 'stdin-after-start'
  })
}

function basePlan(args: {
  agent: string
  command: string
  expectedProcess: string
  env?: Record<string, string>
  followupPrompt?: string | null
  promptInjectionMode: AgentPromptInjectionMode
  preflightTrust: AgentPreflightTrust | null
  promptDelivery: AgentLaunchPlan['promptDelivery']
}): AgentLaunchPlan {
  return {
    agent: args.agent,
    command: args.command,
    expectedProcess: args.expectedProcess,
    env: args.env ?? {},
    followupPrompt: args.followupPrompt ?? null,
    promptInjectionMode: args.promptInjectionMode,
    preflightTrust: args.preflightTrust,
    promptDelivery: args.promptDelivery
  }
}

function resolveRuntimePlatform(): HostPlatform {
  if (typeof process !== 'undefined' && process.platform) {
    return process.platform
  }
  return 'browser'
}
