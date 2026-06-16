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
  if (options.preset === 'codex') {
    markCodexProjectTrusted(options.workspacePath, options)
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

export type CodexProjectTrustLevel = 'trusted' | 'untrusted'

export function markCodexProjectTrusted(
  workspacePath: string,
  options: AgentTrustWriteOptions = {}
): void {
  const absPath = canonicalize(workspacePath)
  upsertProjectTrustLevel(join(resolveHomeDir(options), '.codex', 'config.toml'), absPath, 'trusted')
}

export function upsertProjectTrustLevel(
  configPath: string,
  projectPath: string,
  trustLevel: CodexProjectTrustLevel
): void {
  const existing = existsSync(configPath) ? readTomlFile(configPath) : ''
  const updated = upsertProjectTrustLevelInContent(existing, projectPath, trustLevel)
  if (updated === existing) {
    return
  }
  writeFileAtomically(configPath, updated)
}

export function upsertProjectTrustLevelInContent(
  existingContent: string,
  projectPath: string,
  trustLevel: CodexProjectTrustLevel
): string {
  const existing =
    existingContent.charCodeAt(0) === 0xfeff ? existingContent.slice(1) : existingContent
  const trustedProjectPath = canonicalize(projectPath)
  const headerPattern = buildProjectHeaderPattern(trustedProjectPath)
  const match = headerPattern.exec(existing)
  const eol = existing.includes('\r\n') ? '\r\n' : '\n'
  const trustLine = `trust_level = "${trustLevel}"`

  if (!match) {
    const block = [`[projects."${escapeTomlString(trustedProjectPath)}"]`, trustLine].join(eol)
    if (existing.length === 0) {
      return `${block}${eol}`
    }
    const separator = existing.endsWith(`${eol}${eol}`)
      ? ''
      : existing.endsWith(eol)
        ? eol
        : eol + eol
    return `${existing}${separator}${block}${eol}`
  }

  const headerLineEnd = match.index + match[0].length
  const after = existing.slice(headerLineEnd)
  const nextHeaderRel = findNextTableHeader(after)
  const blockEnd = nextHeaderRel === -1 ? existing.length : headerLineEnd + nextHeaderRel
  const existingBlock = existing.slice(headerLineEnd, blockEnd)
  const trustLevelLinePattern =
    /^[ \t]*trust_level[ \t]*=[ \t]*(?:"(?:trusted|untrusted)"|'(?:trusted|untrusted)')[ \t\r]*(?:#.*)?$/m

  if (trustLevelLinePattern.test(existingBlock)) {
    return (
      existing.slice(0, headerLineEnd) +
      existingBlock.replace(trustLevelLinePattern, trustLine) +
      existing.slice(blockEnd)
    )
  }
  return `${existing.slice(0, headerLineEnd)}${eol}${trustLine}${existing.slice(headerLineEnd)}`
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

function readTomlFile(configPath: string): string {
  const raw = readFileSync(configPath, 'utf8')
  return raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw
}

function buildProjectHeaderPattern(projectPath: string): RegExp {
  const escapedPath = escapeRegex(escapeTomlString(projectPath))
  return new RegExp(
    `(^|\\r?\\n)[ \\t]*\\[projects\\."${escapedPath}"\\][ \\t]*(?:#[^\\r\\n]*)?(?=\\r?\\n|$)`
  )
}

function escapeRegex(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')
}

function escapeTomlString(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('\b', '\\b')
    .replaceAll('\f', '\\f')
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\r')
    .replaceAll('\t', '\\t')
}

function findNextTableHeader(text: string): number {
  let cursor = 0
  let multilineState: TomlMultilineState = { basic: false, literal: false }
  while (cursor < text.length) {
    const newlineIdx = text.indexOf('\n', cursor)
    const lineEnd = newlineIdx === -1 ? text.length : newlineIdx
    const rawLine = text.slice(cursor, lineEnd)
    const line = rawLine.replace(/\r$/, '')
    if (!isInsideTomlMultilineString(multilineState)) {
      const trimmed = line.trimStart()
      if (trimmed.startsWith('[') && isCompleteTableHeader(trimmed)) {
        return cursor
      }
    }
    multilineState = updateTomlMultilineState(multilineState, line)
    if (newlineIdx === -1) {
      return -1
    }
    cursor = newlineIdx + 1
  }
  return -1
}

function isCompleteTableHeader(line: string): boolean {
  if (!line.startsWith('[')) {
    return false
  }
  const isArrayHeader = line.startsWith('[[')
  let index = isArrayHeader ? 2 : 1
  let inBasicQuote = false
  let inLiteralQuote = false
  while (index < line.length) {
    const char = line[index]
    if (inBasicQuote) {
      if (char === '\\' && index + 1 < line.length) {
        index += 2
        continue
      }
      if (char === '"') {
        inBasicQuote = false
      }
      index += 1
      continue
    }
    if (inLiteralQuote) {
      if (char === "'") {
        inLiteralQuote = false
      }
      index += 1
      continue
    }
    if (char === '"') {
      inBasicQuote = true
      index += 1
      continue
    }
    if (char === "'") {
      inLiteralQuote = true
      index += 1
      continue
    }
    if (char === ']') {
      if (isArrayHeader) {
        if (line[index + 1] !== ']') {
          return false
        }
        return /^\s*(#.*)?$/.test(line.slice(index + 2))
      }
      return /^\s*(#.*)?$/.test(line.slice(index + 1))
    }
    index += 1
  }
  return false
}

type TomlMultilineState = {
  basic: boolean
  literal: boolean
}

type TomlMultilineMode = 'basic' | 'literal' | null

function isInsideTomlMultilineString(state: TomlMultilineState): boolean {
  return state.basic || state.literal
}

function updateTomlMultilineState(state: TomlMultilineState, line: string): TomlMultilineState {
  let mode: TomlMultilineMode = state.basic ? 'basic' : state.literal ? 'literal' : null
  let index = 0
  while (index < line.length) {
    if (mode === 'basic') {
      if (line[index] === '\\') {
        index += 2
        continue
      }
      if (line.startsWith('"""', index)) {
        mode = null
        index += 3
        continue
      }
      index += 1
      continue
    }
    if (mode === 'literal') {
      if (line.startsWith("'''", index)) {
        mode = null
        index += 3
        continue
      }
      index += 1
      continue
    }

    const char = line[index]
    if (char === '#') {
      break
    }
    if (line.startsWith('"""', index)) {
      mode = 'basic'
      index += 3
      continue
    }
    if (line.startsWith("'''", index)) {
      mode = 'literal'
      index += 3
      continue
    }
    if (char === '"') {
      index = skipTomlBasicString(line, index + 1)
      continue
    }
    if (char === "'") {
      index = skipTomlLiteralString(line, index + 1)
      continue
    }
    index += 1
  }
  return { basic: mode === 'basic', literal: mode === 'literal' }
}

function skipTomlBasicString(line: string, startIndex: number): number {
  let index = startIndex
  while (index < line.length) {
    const char = line[index]
    if (char === '\\') {
      index += 2
      continue
    }
    if (char === '"') {
      return index + 1
    }
    index += 1
  }
  return index
}

function skipTomlLiteralString(line: string, startIndex: number): number {
  const endIndex = line.indexOf("'", startIndex)
  return endIndex === -1 ? line.length : endIndex + 1
}

function writeFileAtomically(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true })
  const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tempPath, content, 'utf8')
  renameSync(tempPath, path)
}
