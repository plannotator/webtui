export const AGENT_STATUS_STATES = ['working', 'blocked', 'waiting', 'done'] as const
export type AgentStatusState = (typeof AGENT_STATUS_STATES)[number]

export type AgentStatusPayload = {
  state: AgentStatusState
  prompt: string
  agentType?: string
  toolName?: string
  toolInput?: string
  lastAssistantMessage?: string
  interrupted?: boolean
}

export type ProcessedAgentStatusChunk = {
  cleanData: string
  payloads: AgentStatusPayload[]
}

const VALID_STATES = new Set<string>(AGENT_STATUS_STATES)
const OSC_AGENT_STATUS_PREFIX = '\x1b]9999;'

export function parseAgentStatusPayload(json: string): AgentStatusPayload | null {
  try {
    return normalizeAgentStatusPayload(JSON.parse(json))
  } catch {
    return null
  }
}

export function normalizeAgentStatusPayload(payload: unknown): AgentStatusPayload | null {
  if (typeof payload !== 'object' || payload === null) {
    return null
  }
  const obj = payload as Record<string, unknown>
  if (typeof obj.state !== 'string' || !VALID_STATES.has(obj.state)) {
    return null
  }

  const normalized: AgentStatusPayload = {
    state: obj.state as AgentStatusState,
    prompt: normalizeSingleLine(obj.prompt, 200)
  }
  const agentType = normalizeOptionalSingleLine(obj.agentType, 40)
  const toolName = normalizeOptionalSingleLine(obj.toolName, 60)
  const toolInput = normalizeOptionalSingleLine(obj.toolInput, 160)
  const lastAssistantMessage = normalizeOptionalMultiline(obj.lastAssistantMessage, 8000)
  if (agentType) {
    normalized.agentType = agentType
  }
  if (toolName) {
    normalized.toolName = toolName
  }
  if (toolInput) {
    normalized.toolInput = toolInput
  }
  if (lastAssistantMessage) {
    normalized.lastAssistantMessage = lastAssistantMessage
  }
  if (obj.interrupted === true && obj.state === 'done') {
    normalized.interrupted = true
  }
  return normalized
}

export function createAgentStatusOscProcessor(): (data: string) => ProcessedAgentStatusChunk {
  const maxPending = 64 * 1024
  let pending = ''

  return (data: string): ProcessedAgentStatusChunk => {
    const combined = pending + data
    pending = ''

    const payloads: AgentStatusPayload[] = []
    let cleanData = ''
    let cursor = 0

    while (cursor < combined.length) {
      const start = combined.indexOf(OSC_AGENT_STATUS_PREFIX, cursor)
      if (start === -1) {
        const tail = combined.slice(cursor)
        const prefixLength = OSC_AGENT_STATUS_PREFIX.length
        let partialPrefixLength = 0
        for (let i = Math.min(prefixLength - 1, tail.length); i > 0; i -= 1) {
          if (tail.endsWith(OSC_AGENT_STATUS_PREFIX.slice(0, i))) {
            partialPrefixLength = i
            break
          }
        }
        if (partialPrefixLength > 0) {
          cleanData += tail.slice(0, tail.length - partialPrefixLength)
          pending = tail.slice(tail.length - partialPrefixLength)
        } else {
          cleanData += tail
        }
        break
      }

      cleanData += combined.slice(cursor, start)
      const payloadStart = start + OSC_AGENT_STATUS_PREFIX.length
      const terminator = findOscTerminator(combined, payloadStart)
      if (!terminator) {
        const candidate = combined.slice(start)
        pending = candidate.length > maxPending ? '' : candidate
        break
      }

      const parsed = parseAgentStatusPayload(combined.slice(payloadStart, terminator.index))
      if (parsed) {
        payloads.push(parsed)
      }
      cursor = terminator.index + terminator.length
    }

    return { cleanData, payloads }
  }
}

function findOscTerminator(data: string, from: number): { index: number; length: 1 | 2 } | null {
  const bel = data.indexOf('\x07', from)
  const st = data.indexOf('\x1b\\', from)
  if (bel === -1 && st === -1) {
    return null
  }
  if (bel === -1) {
    return { index: st, length: 2 }
  }
  if (st === -1 || bel < st) {
    return { index: bel, length: 1 }
  }
  return { index: st, length: 2 }
}

function normalizeSingleLine(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') {
    return ''
  }
  return trimUtf16(value.trim().replace(/[\r\n\u2028\u2029]+/g, ' '), maxLength)
}

function normalizeOptionalSingleLine(value: unknown, maxLength: number): string | undefined {
  const normalized = normalizeSingleLine(value, maxLength)
  return normalized ? normalized : undefined
}

function normalizeOptionalMultiline(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const normalized = trimUtf16(
    value
      .trim()
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[\u2028\u2029]/g, '\n')
      .replace(/\n{3,}/g, '\n\n'),
    maxLength
  )
  return normalized ? normalized : undefined
}

function trimUtf16(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value
  }
  let result = value.slice(0, maxLength)
  const lastCode = result.charCodeAt(result.length - 1)
  if (lastCode >= 0xd800 && lastCode <= 0xdbff) {
    result = result.slice(0, -1)
  }
  return result
}
