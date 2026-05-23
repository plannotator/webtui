import type { Server as HttpServer } from 'node:http'

import { WebSocketServer, type RawData, type WebSocket } from 'ws'

import type { PtyBackend, PtySession, PtySpawnOptions } from '../core/index.js'
import { NodePtyBackend } from './local-pty-backend.js'

type ServerOptions = {
  port?: number
  path?: string
  server?: HttpServer
  backend?: PtyBackend
}

type ClientMessage =
  | { type: 'spawn'; requestId: string; options: PtySpawnOptions }
  | { type: 'write'; id: string; data: string }
  | { type: 'resize'; id: string; cols: number; rows: number }
  | { type: 'kill'; id: string; signal?: string }
  | { type: 'getForegroundProcess'; requestId: string; id: string }
  | { type: 'hasChildProcesses'; requestId: string; id: string }

export type NodePtyWebSocketServer = {
  close(): Promise<void>
  address(): ReturnType<WebSocketServer['address']>
}

export function createNodePtyWebSocketServer(
  options: ServerOptions = {}
): NodePtyWebSocketServer {
  const backend = options.backend ?? new NodePtyBackend()
  const wss = new WebSocketServer({
    port: options.server ? undefined : (options.port ?? 8731),
    path: options.path ?? '/pty',
    server: options.server
  })

  wss.on('connection', (socket) => {
    const sessions = new Map<string, PtySession>()
    socket.on('message', (raw) => {
      void handleClientMessage({ raw, socket, backend, sessions })
    })
    socket.on('close', () => {
      for (const session of sessions.values()) {
        session.kill()
      }
      sessions.clear()
    })
  })

  return {
    close(): Promise<void> {
      return new Promise((resolve, reject) => {
        wss.close((err) => (err ? reject(err) : resolve()))
      })
    },
    address() {
      return wss.address()
    }
  }
}

async function handleClientMessage(args: {
  raw: RawData
  socket: WebSocket
  backend: PtyBackend
  sessions: Map<string, PtySession>
}): Promise<void> {
  const message = parseClientMessage(args.raw)
  if (!message) {
    return
  }

  if (message.type === 'spawn') {
    try {
      const session = await args.backend.spawn(message.options)
      args.sessions.set(session.id, session)
      send(args.socket, { type: 'spawned', requestId: message.requestId, id: session.id })
      session.onData((data) => send(args.socket, { type: 'data', id: session.id, data }))
      session.onExit((exit) => {
        send(args.socket, { type: 'exit', id: session.id, exit })
        args.sessions.delete(session.id)
      })
    } catch (err) {
      send(args.socket, {
        type: 'error',
        requestId: message.requestId,
        message: err instanceof Error ? err.message : String(err)
      })
    }
    return
  }

  const session = args.sessions.get(message.id)
  if (!session) {
    send(args.socket, { type: 'error', id: message.id, message: `Unknown PTY session ${message.id}` })
    return
  }

  if (message.type === 'write') {
    session.write(message.data)
  } else if (message.type === 'resize') {
    session.resize(message.cols, message.rows)
  } else if (message.type === 'kill') {
    session.kill(message.signal)
  } else if (message.type === 'getForegroundProcess') {
    send(args.socket, {
      type: 'foregroundProcess',
      requestId: message.requestId,
      process: session.getForegroundProcess ? await session.getForegroundProcess() : null
    })
  } else if (message.type === 'hasChildProcesses') {
    send(args.socket, {
      type: 'childProcessStatus',
      requestId: message.requestId,
      hasChildren: session.hasChildProcesses ? await session.hasChildProcesses() : false
    })
  }
}

function parseClientMessage(raw: RawData): ClientMessage | null {
  try {
    const parsed = JSON.parse(raw.toString())
    if (typeof parsed === 'object' && parsed !== null && typeof parsed.type === 'string') {
      return parsed as ClientMessage
    }
  } catch {
    return null
  }
  return null
}

function send(socket: WebSocket, payload: unknown): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(payload))
  }
}
