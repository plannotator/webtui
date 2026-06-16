/**
 * Token-matching for agent names inside terminal titles.
 *
 * Agent names must be matched as whole tokens, never as substrings. Substring
 * matching misfires on worktree/cwd titles like "opencode-blinker" or
 * "openclaude", making ordinary shell titles look like agent status.
 */

export const AGENT_NAMES = [
  'claude',
  'openclaude',
  'codex',
  'copilot',
  'cursor',
  'gemini',
  'antigravity',
  'opencode',
  'openclaw',
  'aider',
  'grok'
] as const

const WINDOWS_EXECUTABLE_SUFFIX_RE = String.raw`(?:\.(?:exe|cmd|bat|ps1))`

function buildAgentNameRe(name: string): RegExp {
  return new RegExp(
    `(?<![\\w./\\\\-])${name}(?:${WINDOWS_EXECUTABLE_SUFFIX_RE})?(?![\\w./\\\\-])`,
    'i'
  )
}

const AGENT_NAME_RE_BY_NAME = new Map(AGENT_NAMES.map((name) => [name, buildAgentNameRe(name)]))

const ANY_LEGACY_AGENT_NAME_RE = new RegExp(
  AGENT_NAMES.map(
    (name) => `(?<![\\w./\\\\-])${name}(?:${WINDOWS_EXECUTABLE_SUFFIX_RE})?(?![\\w./\\\\-])`
  ).join('|'),
  'i'
)

export function titleHasAgentName(title: string, name: string): boolean {
  return AGENT_NAME_RE_BY_NAME.get(name as (typeof AGENT_NAMES)[number])?.test(title) ?? false
}

export function titleHasAnyLegacyAgentName(title: string): boolean {
  return ANY_LEGACY_AGENT_NAME_RE.test(title)
}

export const DROID_AGENT_NAME_RE = /(?<![\w./\\-])droid(?![\w./\\-])/i
export const HERMES_AGENT_NAME_RE = /(?<![\w./\\-])hermes(?![\w./\\-])/i
export const AGY_AGENT_NAME_RE = /(?<![\w./\\-])agy(?![\w./\\-])/i
