import type { PtySession } from '../core/index.js'
import { waitForAgentReady, type AgentReadinessOptions } from './agent-ready.js'

export function scheduleAgentFollowupPrompt(args: {
  pty: PtySession
  prompt: string
  expectedProcess: string
  getTitle: () => string
  agentReadiness?: boolean | AgentReadinessOptions
}): () => void {
  let disposed = false
  let timer: ReturnType<typeof globalThis.setTimeout> | null = null
  const sendPrompt = (): void => {
    if (!disposed) {
      args.pty.write(`${args.prompt}\r`)
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
