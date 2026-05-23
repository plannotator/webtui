export const WEBTUI_FILE_PATH_MIME = 'text/x-webtui-file-path'

export type FileTreeNode = {
  kind: 'directory' | 'file'
  name: string
  path: string
  children: FileTreeNode[]
}

export type FileTreeResponse = {
  cwd: string
  tree: FileTreeNode
}

export async function fetchFileTree(cwd: string, signal: AbortSignal): Promise<FileTreeResponse> {
  const params = new URLSearchParams()
  if (cwd.trim()) {
    params.set('cwd', cwd.trim())
  }
  const response = await fetch(`/api/files?${params.toString()}`, { signal })
  const body = (await response.json()) as unknown
  if (!response.ok) {
    throw new Error(getErrorMessage(body))
  }
  if (!isFileTreeResponse(body)) {
    throw new Error('Unable to load files')
  }
  return body
}

function getErrorMessage(body: unknown): string {
  if (typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string') {
    return body.error
  }
  return 'Unable to load files'
}

function isFileTreeResponse(body: unknown): body is FileTreeResponse {
  return (
    typeof body === 'object' &&
    body !== null &&
    'cwd' in body &&
    typeof body.cwd === 'string' &&
    'tree' in body &&
    isFileTreeNode(body.tree)
  )
}

function isFileTreeNode(value: unknown): value is FileTreeNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    (value.kind === 'directory' || value.kind === 'file') &&
    'name' in value &&
    typeof value.name === 'string' &&
    'path' in value &&
    typeof value.path === 'string' &&
    'children' in value &&
    Array.isArray(value.children)
  )
}

export function togglePath(paths: string[], path: string): string[] {
  const next = new Set(paths)
  if (next.has(path)) {
    next.delete(path)
  } else {
    next.add(path)
  }
  return [...next].sort((a, b) => a.localeCompare(b))
}

export function createPathPayload(paths: Iterable<string>): string {
  return [...paths].map(quoteShellValue).join(' ')
}

export function appendPromptPayload(current: string, payload: string): string {
  const trimmedPayload = payload.trim()
  if (!trimmedPayload) {
    return current
  }
  const trimmed = current.trimEnd()
  return trimmed ? `${trimmed}\n${trimmedPayload}` : trimmedPayload
}

export function createTerminalDropPayload(text: string, files: File[]): string | null {
  const trimmed = text.trim()
  if (trimmed) {
    return trimmed
  }
  if (files.length === 0) {
    return null
  }
  return createPathPayload(files.map(getFilePath))
}

function getFilePath(file: File): string {
  const hostFile = file as File & { path?: string }
  return hostFile.path ?? (file.webkitRelativePath || file.name)
}

export function quoteShellValue(value: string): string {
  if (/^[A-Za-z0-9_./:@=-]+$/.test(value)) {
    return value
  }
  return `'${value.replaceAll("'", "'\\''")}'`
}
