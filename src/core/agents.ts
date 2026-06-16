export type AgentPromptInjectionMode =
  | 'argv'
  | 'flag-prompt'
  | 'flag-prompt-interactive'
  | 'flag-interactive'
  | 'stdin-after-start'

export type AgentPreflightTrust = 'cursor' | 'copilot' | 'codex'
export type DraftPasteReadySignal = 'render-quiet-after-bracketed-paste' | 'codex-composer-prompt'

export type AgentConfig = {
  detectCommand: string
  launchCommand: string
  expectedProcess: string
  promptInjectionMode: AgentPromptInjectionMode
  preflightTrust?: AgentPreflightTrust
  draftPasteReadySignal?: DraftPasteReadySignal
}

export type AgentConfigMap = Record<string, AgentConfig>

export const BUILT_IN_AGENTS = {
  claude: {
    detectCommand: 'claude',
    launchCommand: 'claude',
    expectedProcess: 'claude',
    promptInjectionMode: 'argv'
  },
  codex: {
    detectCommand: 'codex',
    launchCommand: 'codex',
    expectedProcess: 'codex',
    promptInjectionMode: 'argv',
    preflightTrust: 'codex',
    draftPasteReadySignal: 'codex-composer-prompt'
  },
  autohand: {
    detectCommand: 'autohand',
    launchCommand: 'autohand',
    expectedProcess: 'autohand',
    promptInjectionMode: 'stdin-after-start'
  },
  opencode: {
    detectCommand: 'opencode',
    launchCommand: 'opencode',
    expectedProcess: 'opencode',
    promptInjectionMode: 'flag-prompt'
  },
  pi: {
    detectCommand: 'pi',
    launchCommand: 'pi',
    expectedProcess: 'pi',
    promptInjectionMode: 'argv'
  },
  gemini: {
    detectCommand: 'gemini',
    launchCommand: 'gemini',
    expectedProcess: 'gemini',
    promptInjectionMode: 'flag-prompt-interactive'
  },
  aider: {
    detectCommand: 'aider',
    launchCommand: 'aider',
    expectedProcess: 'aider',
    promptInjectionMode: 'stdin-after-start'
  },
  goose: {
    detectCommand: 'goose',
    launchCommand: 'goose',
    expectedProcess: 'goose',
    promptInjectionMode: 'stdin-after-start'
  },
  amp: {
    detectCommand: 'amp',
    launchCommand: 'amp',
    expectedProcess: 'amp',
    promptInjectionMode: 'stdin-after-start'
  },
  kilo: {
    detectCommand: 'kilo',
    launchCommand: 'kilo',
    expectedProcess: 'kilo',
    promptInjectionMode: 'stdin-after-start'
  },
  kiro: {
    detectCommand: 'kiro-cli',
    launchCommand: 'kiro-cli',
    expectedProcess: 'kiro-cli',
    promptInjectionMode: 'stdin-after-start'
  },
  crush: {
    detectCommand: 'crush',
    launchCommand: 'crush',
    expectedProcess: 'crush',
    promptInjectionMode: 'stdin-after-start'
  },
  aug: {
    detectCommand: 'auggie',
    launchCommand: 'auggie',
    expectedProcess: 'auggie',
    promptInjectionMode: 'stdin-after-start'
  },
  cline: {
    detectCommand: 'cline',
    launchCommand: 'cline',
    expectedProcess: 'cline',
    promptInjectionMode: 'stdin-after-start'
  },
  codebuff: {
    detectCommand: 'codebuff',
    launchCommand: 'codebuff',
    expectedProcess: 'codebuff',
    promptInjectionMode: 'stdin-after-start'
  },
  continue: {
    detectCommand: 'continue',
    launchCommand: 'continue',
    expectedProcess: 'continue',
    promptInjectionMode: 'stdin-after-start'
  },
  cursor: {
    detectCommand: 'cursor-agent',
    launchCommand: 'cursor-agent',
    expectedProcess: 'cursor-agent',
    promptInjectionMode: 'argv',
    preflightTrust: 'cursor'
  },
  droid: {
    detectCommand: 'droid',
    launchCommand: 'droid',
    expectedProcess: 'droid',
    promptInjectionMode: 'argv'
  },
  kimi: {
    detectCommand: 'kimi',
    launchCommand: 'kimi',
    expectedProcess: 'kimi',
    promptInjectionMode: 'stdin-after-start'
  },
  'mistral-vibe': {
    detectCommand: 'mistral-vibe',
    launchCommand: 'mistral-vibe',
    expectedProcess: 'mistral-vibe',
    promptInjectionMode: 'stdin-after-start'
  },
  'qwen-code': {
    detectCommand: 'qwen-code',
    launchCommand: 'qwen-code',
    expectedProcess: 'qwen-code',
    promptInjectionMode: 'stdin-after-start'
  },
  rovo: {
    detectCommand: 'rovo',
    launchCommand: 'rovo',
    expectedProcess: 'rovo',
    promptInjectionMode: 'stdin-after-start'
  },
  hermes: {
    detectCommand: 'hermes',
    launchCommand: 'hermes',
    expectedProcess: 'hermes',
    promptInjectionMode: 'stdin-after-start'
  },
  copilot: {
    detectCommand: 'copilot',
    launchCommand: 'copilot',
    expectedProcess: 'copilot',
    promptInjectionMode: 'flag-interactive',
    preflightTrust: 'copilot'
  }
} satisfies AgentConfigMap

export type BuiltInAgentId = keyof typeof BUILT_IN_AGENTS

export function listBuiltInAgents(): BuiltInAgentId[] {
  return Object.keys(BUILT_IN_AGENTS) as BuiltInAgentId[]
}

export function resolveAgentConfig(
  agent: string,
  customAgents: AgentConfigMap = {}
): AgentConfig | null {
  return customAgents[agent] ?? BUILT_IN_AGENTS[agent as BuiltInAgentId] ?? null
}
