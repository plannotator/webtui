import {
  buildAgentLaunchPlan,
  type AgentConfigMap,
  type AgentLaunchPlan,
  type AgentPrompt,
  type PtySpawnOptions
} from '../core/index.js'

export type AgentSessionLaunchOptions = {
  cols: number
  rows: number
  cwd?: string | undefined
  env?: Record<string, string> | undefined
  command?: string | undefined
  agent?: string | undefined
  prompt?: AgentPrompt | null | undefined
  customAgents?: AgentConfigMap | undefined
  commandOverrides?: Record<string, string> | undefined
}

export function resolveAgentSessionLaunch(options: AgentSessionLaunchOptions): {
  launchPlan: AgentLaunchPlan | null
  spawnOptions: PtySpawnOptions
} {
  const launchPlan = options.agent ? buildPlanFromOptions(options) : null
  const command = launchPlan?.command ?? options.command
  const spawnEnv = { ...options.env, ...launchPlan?.env }
  const spawnOptions: PtySpawnOptions = {
    cols: options.cols,
    rows: options.rows
  }
  if (command !== undefined) {
    spawnOptions.command = command
  }
  if (options.cwd !== undefined) {
    spawnOptions.cwd = options.cwd
  }
  if (Object.keys(spawnEnv).length > 0) {
    spawnOptions.env = spawnEnv
  }
  if (launchPlan) {
    spawnOptions.agent = launchPlan.agent
    spawnOptions.startupCommandMode = 'shell-ready'
    if (launchPlan.preflightTrust) {
      spawnOptions.preflightTrust = launchPlan.preflightTrust
    }
  }
  return { launchPlan, spawnOptions }
}

function buildPlanFromOptions(options: AgentSessionLaunchOptions): AgentLaunchPlan {
  const planOptions: Parameters<typeof buildAgentLaunchPlan>[0] = {
    agent: options.agent ?? '',
    allowEmptyPromptLaunch: true
  }
  if (options.prompt !== undefined) {
    planOptions.prompt = options.prompt
  }
  if (options.customAgents !== undefined) {
    planOptions.customAgents = options.customAgents
  }
  if (options.commandOverrides !== undefined) {
    planOptions.commandOverrides = options.commandOverrides
  }
  return buildAgentLaunchPlan(planOptions)
}
