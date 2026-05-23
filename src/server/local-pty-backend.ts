import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { chmodSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'

import * as nodePty from 'node-pty'

import type {
  PtyBackend,
  PtyExit,
  PtySession,
  PtySpawnOptions,
  StartupCommandMode,
  Unsubscribe
} from '../core/index.js'
import { markAgentWorkspaceTrusted } from './agent-trust.js'
import {
  createShellReadyScanState,
  getShellReadyLaunchConfig,
  scanForShellReady,
  STARTUP_COMMAND_READY_MAX_WAIT_MS,
  writeStartupCommand,
  type ShellReadyScanState,
  type StartupCommandState
} from './local-shell-ready.js'

export type NodePtyBackendOptions = {
  shell?: string
  env?: Record<string, string>
  terminalProgram?: string
  terminalProgramVersion?: string
  startupCommandMode?: StartupCommandMode
  agentTrustPreflight?: boolean
}

const execFileAsync = promisify(execFile)

export class NodePtyBackend implements PtyBackend {
  constructor(private readonly options: NodePtyBackendOptions = {}) {}

  async spawn(options: PtySpawnOptions): Promise<PtySession> {
    ensureNodePtySpawnHelperExecutable()
    if (this.options.agentTrustPreflight && options.preflightTrust && options.cwd) {
      try {
        markAgentWorkspaceTrusted({ preset: options.preflightTrust, workspacePath: options.cwd })
      } catch {
        // Trust preflight is best-effort. A failed write should not block agent launch.
      }
    }
    const launch = resolvePtyLaunch(
      options.command,
      this.options.shell,
      options.startupCommandMode ?? this.options.startupCommandMode ?? 'shell-ready'
    )
    const id = randomUUID()
    const envOptions: Parameters<typeof createTerminalEnvironment>[0] = { base: process.env }
    if (this.options.env !== undefined) {
      envOptions.backend = this.options.env
    }
    if (options.env !== undefined) {
      envOptions.session = options.env
    }
    if (this.options.terminalProgram !== undefined) {
      envOptions.terminalProgram = this.options.terminalProgram
    }
    if (this.options.terminalProgramVersion !== undefined) {
      envOptions.terminalProgramVersion = this.options.terminalProgramVersion
    }
    const env = createTerminalEnvironment(envOptions)
    const pty = nodePty.spawn(launch.file, launch.args, {
      name: options.name ?? 'xterm-256color',
      cols: options.cols ?? 80,
      rows: options.rows ?? 24,
      cwd: options.cwd ?? process.cwd(),
      env: { ...env, ...launch.env }
    })

    return new NodePtySession(id, pty, launch.startup)
  }
}

export function createTerminalEnvironment(args: {
  base: NodeJS.ProcessEnv
  backend?: Record<string, string>
  session?: Record<string, string>
  terminalProgram?: string
  terminalProgramVersion?: string
}): Record<string, string> {
  const env: Record<string, string> = {
    ...filterStringEnv(args.base),
    ...args.backend,
    ...args.session,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    TERM_PROGRAM: args.terminalProgram ?? 'webtui',
    TERM_PROGRAM_VERSION: args.terminalProgramVersion ?? '0.0.0-local',
    FORCE_HYPERLINK: '1'
  }
  // A host shell can set NO_COLOR for its own logs. A terminal backend should
  // not force that parent-only choice onto launched agents.
  delete env.NO_COLOR
  env.LANG ??= 'en_US.UTF-8'
  return env
}

function filterStringEnv(base: NodeJS.ProcessEnv): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(base)) {
    if (typeof value === 'string') {
      env[key] = value
    }
  }
  return env
}

let didEnsureSpawnHelper = false
const require = createRequire(import.meta.url)

function ensureNodePtySpawnHelperExecutable(): void {
  if (didEnsureSpawnHelper || os.platform() === 'win32') {
    return
  }
  didEnsureSpawnHelper = true
  const packagePath = require.resolve('node-pty/package.json')
  const helperPath = join(
    dirname(packagePath),
    'prebuilds',
    `${os.platform()}-${os.arch()}`,
    'spawn-helper'
  )
  if (existsSync(helperPath)) {
    // The npm prebuild can arrive without executable mode; node-pty then fails
    // before launching any user process. Fix only the package-local helper.
    chmodSync(helperPath, 0o755)
  }
}

class NodePtySession implements PtySession {
  private dataListeners = new Set<(data: string) => void>()
  private exitListeners = new Set<(event: PtyExit) => void>()
  private shellReadyScanState: ShellReadyScanState | null = null
  private startupCommand: string | null = null
  private shellReadyTimer: ReturnType<typeof setTimeout> | null = null
  private postReadyTimer: ReturnType<typeof setTimeout> | null = null
  private waitingForPostReadyData = false
  private startupSent = false

  constructor(
    readonly id: string,
    private readonly pty: nodePty.IPty,
    startup?: StartupCommandState | null
  ) {
    if (startup) {
      this.startupCommand = startup.command
      if (startup.supportsReadyMarker) {
        this.shellReadyScanState = createShellReadyScanState()
        this.shellReadyTimer = setTimeout(
          () => this.finishShellReady(),
          STARTUP_COMMAND_READY_MAX_WAIT_MS
        )
      } else {
        this.postReadyTimer = setTimeout(() => this.flushStartupCommand(), 0)
      }
    }

    this.pty.onData((data) => this.handleData(data))
    this.pty.onExit((event) => {
      this.cleanupStartupTimers()
      const exit: PtyExit = { exitCode: event.exitCode }
      if (event.signal !== undefined) {
        exit.signal = event.signal
      }
      for (const listener of this.exitListeners) {
        listener(exit)
      }
      this.dataListeners.clear()
      this.exitListeners.clear()
    })
  }

  write(data: string): void {
    this.pty.write(data)
  }

  resize(cols: number, rows: number): void {
    this.pty.resize(Math.max(2, cols), Math.max(2, rows))
  }

  kill(signal?: string): void {
    this.cleanupStartupTimers()
    this.pty.kill(signal)
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
    return Promise.resolve(this.pty.process || null)
  }

  async hasChildProcesses(): Promise<boolean> {
    return hasChildProcesses(this.pty.pid)
  }

  private handleData(rawData: string): void {
    let data = rawData
    if (this.shellReadyScanState && !this.startupSent) {
      const scanned = scanForShellReady(this.shellReadyScanState, rawData)
      data = scanned.output
      if (scanned.matched) {
        this.finishShellReady()
      }
    }

    if (data.length > 0) {
      for (const listener of this.dataListeners) {
        listener(data)
      }
    }

    if (this.waitingForPostReadyData && data.length > 0) {
      this.waitingForPostReadyData = false
      if (this.postReadyTimer) {
        clearTimeout(this.postReadyTimer)
      }
      this.postReadyTimer = setTimeout(() => this.flushStartupCommand(), 30)
    }
  }

  private finishShellReady(): void {
    if (this.startupSent || !this.startupCommand) {
      return
    }
    if (this.shellReadyTimer) {
      clearTimeout(this.shellReadyTimer)
      this.shellReadyTimer = null
    }
    this.shellReadyScanState = null
    this.waitingForPostReadyData = true
    if (this.postReadyTimer) {
      clearTimeout(this.postReadyTimer)
    }
    this.postReadyTimer = setTimeout(() => this.flushStartupCommand(), 50)
  }

  private flushStartupCommand(): void {
    if (this.startupSent || !this.startupCommand) {
      return
    }
    this.startupSent = true
    this.cleanupStartupTimers()
    writeStartupCommand(this.pty, this.startupCommand)
  }

  private cleanupStartupTimers(): void {
    if (this.shellReadyTimer) {
      clearTimeout(this.shellReadyTimer)
      this.shellReadyTimer = null
    }
    if (this.postReadyTimer) {
      clearTimeout(this.postReadyTimer)
      this.postReadyTimer = null
    }
    this.waitingForPostReadyData = false
  }
}

function resolvePtyLaunch(
  command: string | undefined,
  preferredShell: string | undefined,
  startupCommandMode: StartupCommandMode
): {
  file: string
  args: string[]
  env?: Record<string, string>
  startup?: StartupCommandState | null
} {
  const platform = os.platform()
  if (platform === 'win32') {
    const shell = preferredShell ?? process.env.ComSpec ?? 'cmd.exe'
    return command ? { file: shell, args: ['/d', '/s', '/c', command] } : { file: shell, args: [] }
  }

  const shell = preferredShell ?? process.env.SHELL ?? '/bin/bash'
  if (command && startupCommandMode === 'shell-ready') {
    const shellReady = getShellReadyLaunchConfig(shell)
    if (shellReady) {
      return {
        file: shell,
        args: shellReady.args,
        env: shellReady.env,
        startup: { command, supportsReadyMarker: shellReady.supportsReadyMarker }
      }
    }
  }
  return command ? { file: shell, args: ['-lc', command] } : { file: shell, args: [] }
}

async function hasChildProcesses(pid: number): Promise<boolean> {
  if (!Number.isFinite(pid) || pid <= 0 || os.platform() === 'win32') {
    return false
  }
  try {
    const { stdout } = await execFileAsync('ps', ['-axo', 'ppid='], { timeout: 1000 })
    return stdout
      .split(/\r?\n/)
      .some((line) => Number.parseInt(line.trim(), 10) === pid)
  } catch {
    return false
  }
}
