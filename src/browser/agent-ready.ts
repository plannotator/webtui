import {
  detectAgentStatusFromTitle,
  isShellProcess,
  type PtySession
} from '../core/index.js'

export type AgentReadyReason = 'title-idle' | 'foreground-match' | 'child-process' | 'timeout'

export type AgentReadyResult = {
  ready: boolean
  reason: AgentReadyReason
}

export type AgentReadinessOptions = {
  timeoutMs?: number
  fallbackDelayMs?: number
  pollIntervalMs?: number
}

const DEFAULT_TIMEOUT_MS = 5000
const DEFAULT_FALLBACK_DELAY_MS = 500
const DEFAULT_POLL_INTERVAL_MS = 120

export async function waitForAgentReady(args: {
  pty: PtySession
  expectedProcess: string
  getTitle?: () => string | null | undefined
  options?: AgentReadinessOptions
}): Promise<AgentReadyResult> {
  const hasProcessSignals =
    typeof args.pty.getForegroundProcess === 'function' ||
    typeof args.pty.hasChildProcesses === 'function'
  const timeoutMs =
    args.options?.timeoutMs ??
    (hasProcessSignals ? DEFAULT_TIMEOUT_MS : DEFAULT_FALLBACK_DELAY_MS)
  const pollIntervalMs = args.options?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
  const deadline = Date.now() + timeoutMs
  const expected = args.expectedProcess.toLowerCase()
  let attempt = 0

  while (Date.now() < deadline) {
    if (attempt > 0) {
      await delay(pollIntervalMs)
    }
    attempt += 1

    const title = args.getTitle?.()
    if (title && detectAgentStatusFromTitle(title) === 'idle') {
      return { ready: true, reason: 'title-idle' }
    }

    let foreground: string | null = null
    try {
      foreground = (await args.pty.getForegroundProcess?.())?.toLowerCase() ?? null
    } catch {
      foreground = null
    }

    if (foreground && foregroundMatchesExpectedProcess(foreground, expected)) {
      return { ready: true, reason: 'foreground-match' }
    }

    if (attempt >= 4 && typeof args.pty.hasChildProcesses === 'function') {
      const foregroundBaseName = foreground ? getProcessBaseName(foreground) : null
      const foregroundIsExpected =
        foreground !== null && foregroundMatchesExpectedProcess(foreground, expected)
      const foregroundIsShell = foregroundBaseName ? isShellProcess(foregroundBaseName) : false
      if (!foregroundIsExpected || foregroundIsShell) {
        try {
          if (await args.pty.hasChildProcesses()) {
            return { ready: true, reason: 'child-process' }
          }
        } catch {
          // Keep polling until the budget expires.
        }
      }
    }
  }

  return { ready: false, reason: 'timeout' }
}

function getProcessBaseName(processName: string): string {
  return processName.split(/[\\/]/).pop() ?? processName
}

function foregroundMatchesExpectedProcess(foreground: string, expected: string): boolean {
  return (
    foreground === expected ||
    foreground.startsWith(`${expected}.`) ||
    foreground.endsWith(`/${expected}`) ||
    foreground.endsWith(`\\${expected}`)
  )
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms))
}
