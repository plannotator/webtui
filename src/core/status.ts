import {
  AGENT_NAMES,
  AGY_AGENT_NAME_RE,
  DROID_AGENT_NAME_RE,
  HERMES_AGENT_NAME_RE,
  titleHasAnyLegacyAgentName
} from './agent-name-token-match.js'

export type TerminalAgentStatus = 'working' | 'permission' | 'idle'

const CLAUDE_IDLE = '\u2733'
const CLAUDE_MANAGEMENT_TITLE_RE =
  /^\s*(?:"(?:.*[\\/])?claude(?:\.(?:exe|cmd|bat|ps1))?"|'(?:.*[\\/])?claude(?:\.(?:exe|cmd|bat|ps1))?'|(?:.*[\\/])?claude(?:\.(?:exe|cmd|bat|ps1))?)\s+agents\s*$/i
const GEMINI_WORKING = '\u2726'
const GEMINI_SILENT_WORKING = '\u23f2'
const GEMINI_IDLE = '\u25c7'
const GEMINI_PERMISSION = '\u270b'
const PI_IDLE_PREFIX = '\u03c0 - '
const CURSOR_NATIVE_TITLE_LOWER = 'cursor agent'

export const AGENT_TITLE_NAMES = AGENT_NAMES

const STRONG_IDLE_KEYWORDS = ['ready', 'idle', 'done'] as const
const STRONG_WORKING_KEYWORDS = ['working', 'thinking', 'running'] as const
const STRONG_IDLE_KEYWORDS_RE = new RegExp(
  `(?<![\\w./\\\\-])(${STRONG_IDLE_KEYWORDS.join('|')})(?![\\w\\-])`,
  'i'
)
const STRONG_WORKING_KEYWORDS_RE = new RegExp(
  `(?<![\\w./\\\\-])(${STRONG_WORKING_KEYWORDS.join('|')})(?![\\w\\-])`,
  'i'
)
const STRONG_WORKING_KEYWORDS_RE_GLOBAL = new RegExp(STRONG_WORKING_KEYWORDS_RE.source, 'gi')
// eslint-disable-next-line no-control-regex -- intentional terminal escape sequence matching
const OSC_TITLE_RE = /\x1b\]([012]);([^\x07\x1b]*?)(?:\x07|\x1b\\)/g

export function extractLastOscTitle(data: string): string | null {
  let last: string | null = null
  for (const match of data.matchAll(OSC_TITLE_RE)) {
    last = match[2] ?? null
  }
  return last
}

export function extractAllOscTitles(data: string): string[] {
  const titles: string[] = []
  for (const match of data.matchAll(OSC_TITLE_RE)) {
    if (match[2]) {
      titles.push(match[2])
    }
  }
  return titles
}

export function detectAgentStatusFromTitle(title: string): TerminalAgentStatus | null {
  if (!title || isClaudeManagementTitle(title)) {
    return null
  }
  if (title.trim().toLowerCase() === CURSOR_NATIVE_TITLE_LOWER) {
    return null
  }

  if (title.includes(GEMINI_PERMISSION)) {
    return 'permission'
  }
  if (title.includes(GEMINI_WORKING) || title.includes(GEMINI_SILENT_WORKING)) {
    return 'working'
  }
  if (title.includes(GEMINI_IDLE)) {
    return 'idle'
  }
  if (title.startsWith(`${CLAUDE_IDLE} `) || title === CLAUDE_IDLE) {
    return 'idle'
  }
  if (isPiTerminalTitle(title)) {
    return 'idle'
  }
  if (containsBrailleSpinner(title)) {
    return 'working'
  }

  const hasDroidAgentName = DROID_AGENT_NAME_RE.test(title)
  const hasHermesAgentName = HERMES_AGENT_NAME_RE.test(title)
  const hasAgyAgentName = AGY_AGENT_NAME_RE.test(title)
  const hasLegacyAgentName = titleHasAnyLegacyAgentName(title)
  if (hasLegacyAgentName || hasDroidAgentName || hasHermesAgentName || hasAgyAgentName) {
    if (containsAny(title, ['action required', 'permission', 'waiting'])) {
      return 'permission'
    }
    if (STRONG_IDLE_KEYWORDS_RE.test(title)) {
      return 'idle'
    }
    if (STRONG_WORKING_KEYWORDS_RE.test(title)) {
      return 'working'
    }
    if (title.startsWith('. ')) {
      return 'working'
    }
    if (title.startsWith('* ')) {
      return 'idle'
    }
    if (hasDroidAgentName && !hasLegacyAgentName) {
      return null
    }
    return 'idle'
  }

  return null
}

export function clearWorkingIndicators(title: string): string {
  let cleaned = title
    .replace(GEMINI_WORKING, '')
    .replace(GEMINI_SILENT_WORKING, '')
    .replace(/[\u2800-\u28ff]/g, '')

  if (cleaned.startsWith('. ')) {
    cleaned = cleaned.slice(2)
  }
  if (containsAgentName(cleaned)) {
    cleaned = cleaned.replace(STRONG_WORKING_KEYWORDS_RE_GLOBAL, '')
  }
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim()
  return cleaned || title
}

export function createAgentStatusTracker(callbacks: {
  onBecameIdle?: (title: string) => void
  onBecameWorking?: (title: string) => void
  onAgentExited?: () => void
}): { handleTitle(title: string): void; reset(): void } {
  let lastStatus: TerminalAgentStatus | null = null

  return {
    handleTitle(title: string): void {
      const nextStatus = detectAgentStatusFromTitle(title)
      if (lastStatus === 'working' && nextStatus !== null && nextStatus !== 'working') {
        callbacks.onBecameIdle?.(title)
      }
      if (lastStatus !== 'working' && nextStatus === 'working') {
        callbacks.onBecameWorking?.(title)
      }
      if (lastStatus !== null && lastStatus !== 'working' && nextStatus === null) {
        lastStatus = null
        callbacks.onAgentExited?.()
      }
      if (nextStatus !== null) {
        lastStatus = nextStatus
      }
    },
    reset(): void {
      lastStatus = null
    }
  }
}

export function isShellProcess(processName: string): boolean {
  return SHELL_NAMES.has(processName.trim().toLowerCase())
}

function containsAgentName(title: string): boolean {
  return (
    titleHasAnyLegacyAgentName(title) ||
    AGY_AGENT_NAME_RE.test(title) ||
    DROID_AGENT_NAME_RE.test(title) ||
    HERMES_AGENT_NAME_RE.test(title)
  )
}

export function isClaudeManagementTitle(title: string): boolean {
  return CLAUDE_MANAGEMENT_TITLE_RE.test(title)
}

function containsAny(title: string, words: readonly string[]): boolean {
  const lower = title.toLowerCase()
  return words.some((word) => lower.includes(word))
}

function isPiTerminalTitle(title: string): boolean {
  return title.startsWith(PI_IDLE_PREFIX)
}

function containsBrailleSpinner(title: string): boolean {
  for (const char of title) {
    const codePoint = char.codePointAt(0)
    if (codePoint !== undefined && codePoint >= 0x2800 && codePoint <= 0x28ff) {
      return true
    }
  }
  return false
}

const SHELL_NAMES = new Set([
  '',
  'bash',
  'zsh',
  'sh',
  'fish',
  'cmd.exe',
  'powershell.exe',
  'pwsh.exe',
  'nu'
])
