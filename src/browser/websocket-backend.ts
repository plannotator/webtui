import type { PtyBackend, PtyExit, PtySession, PtySpawnOptions, Unsubscribe } from '../core/index.js'

type ClientMessage =
  | { type: 'spawn'; requestId: string; options: PtySpawnOptions }
  | { type: 'write'; id: string; data: string }
  | { type: 'resize'; id: string; cols: number; rows: number }
  | { type: 'kill'; id: string; signal?: string }
  | QueryClientMessage

type QueryClientMessage =
  | { type: 'getForegroundProcess'; requestId: string; id: string }
  | { type: 'hasChildProcesses'; requestId: string; id: string }

type QueryClientMessageWithoutRequestId = Omit<QueryClientMessage, 'requestId'>

type ServerMessage =
  | { type: 'spawned'; requestId: string; id: string }
  | { type: 'data'; id: string; data: string }
  | { type: 'exit'; id: string; exit: PtyExit }
  | { type: 'foregroundProcess'; requestId: string; process: string | null }
  | { type: 'childProcessStatus'; requestId: string; hasChildren: boolean }
  | { type: 'error'; requestId?: string; id?: string; message: string }

type PendingSpawn = {
  resolve: (session: BrowserPtySession) => void
  reject: (error: Error) => void
}

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

export class WebSocketPtyBackend implements PtyBackend {
  private socket: WebSocket | null = null
  private connectPromise: Promise<WebSocket> | null = null
  private pending = new Map<string, PendingSpawn>()
  private pendingRequests = new Map<string, PendingRequest>()
  private sessions = new Map<string, BrowserPtySession>()

  constructor(private readonly url: string) {}

  async spawn(options: PtySpawnOptions): Promise<PtySession> {
    const socket = await this.connect()
    const requestId = createRequestId()
    const sessionPromise = new Promise<BrowserPtySession>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject })
    })
    sendJson(socket, { type: 'spawn', requestId, options } satisfies ClientMessage)
    return sessionPromise
  }

  private async connect(): Promise<WebSocket> {
    if (this.socket?.readyState === WebSocket.OPEN) {
      return this.socket
    }
    if (this.connectPromise) {
      return this.connectPromise
    }

    this.connectPromise = new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(this.url)
      socket.addEventListener('open', () => {
        this.socket = socket
        this.connectPromise = null
        resolve(socket)
      })
      socket.addEventListener('message', (event) => this.handleMessage(event.data))
      socket.addEventListener('close', () => {
        this.socket = null
        for (const request of this.pendingRequests.values()) {
          request.reject(new Error('PTY backend connection closed'))
        }
        this.pendingRequests.clear()
        for (const session of this.sessions.values()) {
          session.emitExit({ exitCode: null, signal: 'closed' })
        }
        this.sessions.clear()
      })
      socket.addEventListener('error', () => {
        const error = new Error(`Failed to connect to PTY backend at ${this.url}`)
        this.connectPromise = null
        reject(error)
      })
    })

    return this.connectPromise
  }

  private handleMessage(raw: unknown): void {
    const message = parseServerMessage(raw)
    if (!message) {
      return
    }

    if (message.type === 'spawned') {
      const pending = this.pending.get(message.requestId)
      if (!pending) {
        return
      }
      this.pending.delete(message.requestId)
      const session = new BrowserPtySession(message.id, (outbound) => {
        if (this.socket?.readyState === WebSocket.OPEN) {
          sendJson(this.socket, outbound)
        }
      }, (outbound) => this.request(outbound))
      this.sessions.set(message.id, session)
      pending.resolve(session)
      return
    }

    if (message.type === 'foregroundProcess') {
      this.resolveRequest(message.requestId, message.process)
      return
    }

    if (message.type === 'childProcessStatus') {
      this.resolveRequest(message.requestId, message.hasChildren)
      return
    }

    if (message.type === 'error') {
      if (message.requestId) {
        const pending = this.pending.get(message.requestId)
        if (pending) {
          this.pending.delete(message.requestId)
          pending.reject(new Error(message.message))
        } else {
          this.rejectRequest(message.requestId, new Error(message.message))
        }
      }
      return
    }

    const session = this.sessions.get(message.id)
    if (!session) {
      return
    }
    if (message.type === 'data') {
      session.emitData(message.data)
    } else if (message.type === 'exit') {
      session.emitExit(message.exit)
      this.sessions.delete(message.id)
    }
  }

  private request<T>(message: QueryClientMessageWithoutRequestId): Promise<T> {
    const socket = this.socket
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error(`PTY backend is not connected at ${this.url}`))
    }
    const requestId = createRequestId()
    const payload = { ...message, requestId } as ClientMessage
    const promise = new Promise<T>((resolve, reject) => {
      this.pendingRequests.set(requestId, {
        resolve: (value) => resolve(value as T),
        reject
      })
    })
    sendJson(socket, payload)
    return promise
  }

  private resolveRequest(requestId: string, value: unknown): void {
    const pending = this.pendingRequests.get(requestId)
    if (!pending) {
      return
    }
    this.pendingRequests.delete(requestId)
    pending.resolve(value)
  }

  private rejectRequest(requestId: string, error: Error): void {
    const pending = this.pendingRequests.get(requestId)
    if (!pending) {
      return
    }
    this.pendingRequests.delete(requestId)
    pending.reject(error)
  }
}

class BrowserPtySession implements PtySession {
  private dataListeners = new Set<(data: string) => void>()
  private exitListeners = new Set<(event: PtyExit) => void>()

  constructor(
    readonly id: string,
    private readonly send: (message: ClientMessage) => void,
    private readonly request: <T>(message: QueryClientMessageWithoutRequestId) => Promise<T>
  ) {}

  write(data: string): void {
    this.send({ type: 'write', id: this.id, data })
  }

  resize(cols: number, rows: number): void {
    this.send({ type: 'resize', id: this.id, cols, rows })
  }

  kill(signal?: string): void {
    this.send(signal ? { type: 'kill', id: this.id, signal } : { type: 'kill', id: this.id })
  }

  onData(callback: (data: string) => void): Unsubscribe {
    this.dataListeners.add(callback)
    return () => this.dataListeners.delete(callback)
  }

  onExit(callback: (event: PtyExit) => void): Unsubscribe {
    this.exitListeners.add(callback)
    return () => this.exitListeners.delete(callback)
  }

  getForegroundProcess(): Promise<string | null> {
    return this.request<string | null>({ type: 'getForegroundProcess', id: this.id })
  }

  hasChildProcesses(): Promise<boolean> {
    return this.request<boolean>({ type: 'hasChildProcesses', id: this.id })
  }

  emitData(data: string): void {
    for (const listener of this.dataListeners) {
      listener(data)
    }
  }

  emitExit(event: PtyExit): void {
    for (const listener of this.exitListeners) {
      listener(event)
    }
    this.dataListeners.clear()
    this.exitListeners.clear()
  }
}

function sendJson(socket: WebSocket, message: ClientMessage): void {
  socket.send(JSON.stringify(message))
}

function parseServerMessage(raw: unknown): ServerMessage | null {
  try {
    const text = typeof raw === 'string' ? raw : raw instanceof Blob ? null : String(raw)
    if (!text) {
      return null
    }
    const parsed = JSON.parse(text)
    if (typeof parsed === 'object' && parsed !== null && typeof parsed.type === 'string') {
      return parsed as ServerMessage
    }
  } catch {
    return null
  }
  return null
}

function createRequestId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}
