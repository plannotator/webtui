import {
  createBracketedPastePayload,
  DECSET_BRACKETED_PASTE,
  type DraftPasteReadySignal,
  type PtySession,
  type Unsubscribe
} from '../core/index.js'
import { waitForAgentReady, type AgentReadinessOptions } from './agent-ready.js'

const CODEX_COMPOSER_PROMPT = '›'
const DEFAULT_QUIET_MS = 1500
const DEFAULT_TIMEOUT_MS = 8000
const DEFAULT_SUBMIT_DELAY_MS = 50
const DEFAULT_FALLBACK_READY_TIMEOUT_MS = 1000
const RECENT_OUTPUT_CHARS = 512
const WAIT_POLL_MS = 10

export type AgentPasteQueue = {
  enqueue<T>(operation: () => Promise<T>): Promise<T>
}

export type AgentPasteReadinessTracker = {
  sawBracketedPasteEnable(): boolean
  sawCodexComposerPrompt(): boolean
  quietAfterBracketedPasteFor(now?: number): number
  dispose(): void
}

export type PasteWhenAgentReadyOptions = {
  pty: PtySession
  content: string
  tracker?: AgentPasteReadinessTracker
  readySignal?: DraftPasteReadySignal | null
  submit?: boolean
  timeoutMs?: number
  quietMs?: number
  submitDelayMs?: number
  queue?: AgentPasteQueue
  expectedProcess?: string
  getTitle?: () => string | null | undefined
  fallbackReadinessOptions?: AgentReadinessOptions
}

export type SubmitBracketedPasteToAgentOptions = {
  pty: PtySession
  content: string
  submit: boolean
  submitDelayMs?: number
  queue?: AgentPasteQueue
}

export function createAgentPasteReadinessTracker(pty: PtySession): AgentPasteReadinessTracker {
  let recent = ''
  let postHandshakeRecent = ''
  let saw2004 = false
  let sawCodexPrompt = false
  let lastPostHandshakeOutputAt = 0

  const observeData = (data: string): void => {
    const now = Date.now()
    const combined = recent + data
    recent = combined.slice(-RECENT_OUTPUT_CHARS)

    if (!saw2004) {
      const markerIndex = combined.indexOf(DECSET_BRACKETED_PASTE)
      if (markerIndex === -1) {
        return
      }
      saw2004 = true
      const postHandshakeChunk = combined.slice(markerIndex + DECSET_BRACKETED_PASTE.length)
      postHandshakeRecent = postHandshakeChunk.slice(-RECENT_OUTPUT_CHARS)
      lastPostHandshakeOutputAt = now
      if (postHandshakeChunk.includes(CODEX_COMPOSER_PROMPT)) {
        sawCodexPrompt = true
      }
      return
    }

    const combinedPostHandshake = postHandshakeRecent + data
    postHandshakeRecent = combinedPostHandshake.slice(-RECENT_OUTPUT_CHARS)
    lastPostHandshakeOutputAt = now
    if (combinedPostHandshake.includes(CODEX_COMPOSER_PROMPT)) {
      sawCodexPrompt = true
    }
  }

  const unsubscribe = pty.onData(observeData)

  return {
    sawBracketedPasteEnable: () => saw2004,
    sawCodexComposerPrompt: () => sawCodexPrompt,
    quietAfterBracketedPasteFor: (now = Date.now()) =>
      saw2004 ? Math.max(0, now - lastPostHandshakeOutputAt) : 0,
    dispose: unsubscribe
  }
}

export function createAgentPasteQueue(): AgentPasteQueue {
  let tail = Promise.resolve()

  return {
    enqueue<T>(operation: () => Promise<T>): Promise<T> {
      const run = tail.then(operation, operation)
      tail = run.then(
        () => undefined,
        () => undefined
      )
      return run
    }
  }
}

export async function submitBracketedPasteToAgent(
  options: SubmitBracketedPasteToAgentOptions
): Promise<boolean> {
  const writePaste = async (): Promise<boolean> => {
    try {
      options.pty.write(createBracketedPastePayload(options.content))
      if (options.submit) {
        await delay(options.submitDelayMs ?? DEFAULT_SUBMIT_DELAY_MS)
        options.pty.write('\r')
      }
      return true
    } catch {
      return false
    }
  }

  return options.queue ? options.queue.enqueue(writePaste) : writePaste()
}

export async function pasteWhenAgentReady(options: PasteWhenAgentReadyOptions): Promise<boolean> {
  const tracker = options.tracker ?? createAgentPasteReadinessTracker(options.pty)
  const ownsTracker = options.tracker === undefined
  try {
    const ready = await waitForPasteReadiness({
      tracker,
      readySignal: options.readySignal ?? 'render-quiet-after-bracketed-paste',
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      quietMs: options.quietMs ?? DEFAULT_QUIET_MS
    })
    if (!ready) {
      const fallbackReady = await waitForFallbackAgentReadiness(options)
      if (!fallbackReady) {
        return false
      }
    }

    const submitOptions: SubmitBracketedPasteToAgentOptions = {
      pty: options.pty,
      content: options.content,
      submit: options.submit === true
    }
    if (options.submitDelayMs !== undefined) {
      submitOptions.submitDelayMs = options.submitDelayMs
    }
    if (options.queue !== undefined) {
      submitOptions.queue = options.queue
    }
    return await submitBracketedPasteToAgent(submitOptions)
  } finally {
    if (ownsTracker) {
      tracker.dispose()
    }
  }
}

async function waitForFallbackAgentReadiness(options: PasteWhenAgentReadyOptions): Promise<boolean> {
  if (!options.expectedProcess) {
    return false
  }
  const fallbackOptions: Parameters<typeof waitForAgentReady>[0] = {
    pty: options.pty,
    expectedProcess: options.expectedProcess,
    options: options.fallbackReadinessOptions ?? {
      timeoutMs: DEFAULT_FALLBACK_READY_TIMEOUT_MS
    }
  }
  if (options.getTitle !== undefined) {
    fallbackOptions.getTitle = options.getTitle
  }
  const result = await waitForAgentReady(fallbackOptions)
  return result.ready
}

function waitForPasteReadiness(args: {
  tracker: AgentPasteReadinessTracker
  readySignal: DraftPasteReadySignal
  timeoutMs: number
  quietMs: number
}): Promise<boolean> {
  const deadline = Date.now() + args.timeoutMs
  return new Promise((resolve) => {
    let timer: ReturnType<typeof globalThis.setTimeout> | null = null

    const finish = (value: boolean): void => {
      if (timer) {
        globalThis.clearTimeout(timer)
        timer = null
      }
      resolve(value)
    }

    const check = (): void => {
      if (isReady(args.tracker, args.readySignal, args.quietMs)) {
        finish(true)
        return
      }
      const remaining = deadline - Date.now()
      if (remaining <= 0) {
        finish(false)
        return
      }
      timer = globalThis.setTimeout(check, Math.min(WAIT_POLL_MS, remaining))
    }

    check()
  })
}

function isReady(
  tracker: AgentPasteReadinessTracker,
  readySignal: DraftPasteReadySignal,
  quietMs: number
): boolean {
  if (!tracker.sawBracketedPasteEnable()) {
    return false
  }
  if (readySignal === 'codex-composer-prompt') {
    return tracker.sawCodexComposerPrompt()
  }
  return tracker.quietAfterBracketedPasteFor() >= quietMs
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms))
}
