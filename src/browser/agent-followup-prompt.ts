import type { DraftPasteReadySignal, PtySession } from '../core/index.js'
import { waitForAgentReady, type AgentReadinessOptions } from './agent-ready.js'
import {
  pasteWhenAgentReady,
  type AgentPasteQueue,
  type AgentPasteReadinessTracker
} from './agent-paste-ready.js'

export function scheduleAgentFollowupPrompt(args: {
  pty: PtySession
  prompt: string
  expectedProcess: string
  getTitle: () => string
  pasteReadinessTracker?: AgentPasteReadinessTracker
  pasteQueue?: AgentPasteQueue
  draftPasteReadySignal?: DraftPasteReadySignal | null
  agentReadiness?: boolean | AgentReadinessOptions
}): () => void {
  let disposed = false
  let timer: ReturnType<typeof globalThis.setTimeout> | null = null
  const sendPrompt = (): void => {
    if (!disposed) {
      const pasteOptions: Parameters<typeof pasteWhenAgentReady>[0] = {
        pty: args.pty,
        content: args.prompt,
        submit: true,
        expectedProcess: args.expectedProcess,
        getTitle: args.getTitle
      }
      if (args.pasteReadinessTracker) {
        pasteOptions.tracker = args.pasteReadinessTracker
      }
      if (args.pasteQueue) {
        pasteOptions.queue = args.pasteQueue
      }
      if (args.draftPasteReadySignal !== undefined) {
        pasteOptions.readySignal = args.draftPasteReadySignal
      }
      void pasteWhenAgentReady(pasteOptions)
    }
  }
  const readinessOptions = resolveAgentReadinessOptions(args.agentReadiness)
  if (readinessOptions) {
    void waitForAgentReady({
      pty: args.pty,
      expectedProcess: args.expectedProcess,
      getTitle: args.getTitle,
      options: readinessOptions
    }).then(sendPrompt)
  } else {
    timer = globalThis.setTimeout(sendPrompt, 500)
  }

  return () => {
    disposed = true
    if (timer) {
      globalThis.clearTimeout(timer)
      timer = null
    }
  }
}

function resolveAgentReadinessOptions(
  config: boolean | AgentReadinessOptions | undefined
): AgentReadinessOptions | null {
  if (config === false) {
    return null
  }
  if (config === true || config === undefined) {
    return {}
  }
  return config
}
