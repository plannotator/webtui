import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import type { AgentPreflightTrust } from '../core/index.js'

export type AgentTrustWriteOptions = {
  homeDir?: string
}

export type MarkAgentWorkspaceTrustedOptions = AgentTrustWriteOptions & {
  preset: AgentPreflightTrust
  workspacePath: string
}

export function markAgentWorkspaceTrusted(options: MarkAgentWorkspaceTrustedOptions): void {
  if (options.preset === 'cursor') {
    markCursorWorkspaceTrusted(options.workspacePath, options)
    return
  }
  markCopilotFolderTrusted(options.workspacePath, options)
}

export function markCursorWorkspaceTrusted(
  workspacePath: string,
  options: AgentTrustWriteOptions = {}
): void {
  const absPath = canonicalize(workspacePath)
  const slug = cursorWorkspaceSlug(absPath)
  if (!slug) {
    return
  }
  const trustDir = join(resolveHomeDir(options), '.cursor', 'projects', slug)
  const trustFile = join(trustDir, '.workspace-trusted')
  if (existsSync(trustFile)) {
    return
  }
  mkdirSync(trustDir, { recursive: true })
  const payload = JSON.stringify(
    { trustedAt: new Date().toISOString(), workspacePath: absPath },
    null,
    2
  )
  writeFileAtomically(trustFile, `${payload}\n`)
}

export function markCopilotFolderTrusted(
  workspacePath: string,
  options: AgentTrustWriteOptions = {}
): void {
  const absPath = canonicalize(workspacePath)
  const configDir = join(resolveHomeDir(options), '.copilot')
  const configPath = join(configDir, 'config.json')
  let config: Record<string, unknown> = {}
  try {
    if (existsSync(configPath)) {
      const raw = readFileSync(configPath, 'utf8')
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        config = parsed as Record<string, unknown>
      }
    }
  } catch {
    return
  }

  const existing = Array.isArray(config.trustedFolders) ? (config.trustedFolders as unknown[]) : []
  const normalizedExisting = existing.map((entry) =>
    typeof entry === 'string' ? canonicalize(entry) : null
  )
  if (normalizedExisting.includes(absPath)) {
    return
  }

  config.trustedFolders = [...existing.filter((entry) => typeof entry === 'string'), absPath]
  mkdirSync(configDir, { recursive: true })
  writeFileAtomically(configPath, `${JSON.stringify(config, null, 2)}\n`)
}

function canonicalize(path: string): string {
  try {
    if (existsSync(path)) {
      return realpathSync(path)
    }
  } catch {
    // Fall through to the caller-provided path.
  }
  return path
}

function cursorWorkspaceSlug(absPath: string): string {
  return absPath.replace(/^[\\/]+/, '').replace(/[\\/]+/g, '-')
}

function resolveHomeDir(options: AgentTrustWriteOptions): string {
  return options.homeDir ?? homedir()
}

function writeFileAtomically(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true })
  const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tempPath, content, 'utf8')
  renameSync(tempPath, path)
}
