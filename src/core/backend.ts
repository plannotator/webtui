import type { AgentPreflightTrust } from './agents.js'

export type Unsubscribe = () => void

export type StartupCommandMode = 'shell-command' | 'shell-ready'

export type PtyExit = {
  exitCode: number | null
  signal?: number | string | null
}

export type PtySpawnOptions = {
  command?: string
  cwd?: string
  env?: Record<string, string>
  cols?: number
  rows?: number
  name?: string
  startupCommandMode?: StartupCommandMode
  agent?: string
  preflightTrust?: AgentPreflightTrust | null
}

export type PtySession = {
  id: string
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(signal?: string): void
  onData(callback: (data: string) => void): Unsubscribe
  onExit(callback: (event: PtyExit) => void): Unsubscribe
  getForegroundProcess?(): Promise<string | null>
  hasChildProcesses?(): Promise<boolean>
}

export type PtyBackend = {
  spawn(options: PtySpawnOptions): Promise<PtySession>
}
