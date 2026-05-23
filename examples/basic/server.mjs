import { createReadStream, existsSync, statSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { createServer } from 'node:http'
import { basename, extname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createNodePtyWebSocketServer, NodePtyBackend } from '../../dist/server/index.js'

const packageRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const staticRoot = join(packageRoot, 'dist-example')
const httpPort = Number(process.env.WEBTUI_EXAMPLE_PORT ?? 8730)
const wsPort = Number(process.env.WEBTUI_PTY_PORT ?? 8731)

if (!existsSync(staticRoot)) {
  console.error('Missing dist-example. Run `pnpm run example:build` first.')
  process.exit(1)
}

createNodePtyWebSocketServer({
  port: wsPort,
  backend: new NodePtyBackend({ agentTrustPreflight: true })
})

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://localhost:${httpPort}`)
  if (url.pathname === '/api/files') {
    void handleFileTreeRequest(url, response)
    return
  }

  const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname
  const filePath = resolve(join(staticRoot, requestedPath))
  if (!filePath.startsWith(staticRoot) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404)
    response.end('Not found')
    return
  }

  response.writeHead(200, { 'content-type': contentType(filePath) })
  createReadStream(filePath).pipe(response)
})

server.listen(httpPort, () => {
  console.log(`webtui example: http://localhost:${httpPort}`)
  console.log(`node-pty websocket: ws://localhost:${wsPort}/pty`)
})

async function handleFileTreeRequest(url, response) {
  try {
    const requestedCwd = url.searchParams.get('cwd')?.trim()
    const root = resolveRequestedCwd(requestedCwd)
    const tree = await readFileTree(root)
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify({ cwd: root, tree }))
  } catch (err) {
    response.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
  }
}

function resolveRequestedCwd(requestedCwd) {
  if (!requestedCwd) {
    return process.cwd()
  }
  return isAbsolute(requestedCwd) ? resolve(requestedCwd) : resolve(process.cwd(), requestedCwd)
}

async function readFileTree(root) {
  const children = await readDirectoryChildren(root, { depth: 0, count: { value: 0 } })
  return {
    kind: 'directory',
    name: basename(root) || root,
    path: root,
    children
  }
}

async function readDirectoryChildren(dir, state) {
  if (state.depth >= 4 || state.count.value >= 700) {
    return []
  }

  const entries = await readdir(dir, { withFileTypes: true })
  const nodes = []
  for (const entry of entries) {
    if (shouldSkipEntry(entry.name)) {
      continue
    }
    state.count.value += 1
    if (state.count.value >= 700) {
      break
    }
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      nodes.push({
        kind: 'directory',
        name: entry.name,
        path,
        children: await readDirectoryChildren(path, {
          depth: state.depth + 1,
          count: state.count
        })
      })
    } else if (entry.isFile()) {
      nodes.push({ kind: 'file', name: entry.name, path, children: [] })
    }
  }

  nodes.sort((a, b) => {
    if (a.kind !== b.kind) {
      return a.kind === 'directory' ? -1 : 1
    }
    return a.name.localeCompare(b.name)
  })
  return nodes
}

function shouldSkipEntry(name) {
  return (
    name === '.git' ||
    name === 'node_modules' ||
    name === 'dist' ||
    name === 'dist-example' ||
    name === '.turbo' ||
    name === '.next'
  )
}

function contentType(filePath) {
  switch (extname(filePath)) {
    case '.html':
      return 'text/html; charset=utf-8'
    case '.js':
      return 'text/javascript; charset=utf-8'
    case '.css':
      return 'text/css; charset=utf-8'
    case '.svg':
      return 'image/svg+xml'
    default:
      return 'application/octet-stream'
  }
}
