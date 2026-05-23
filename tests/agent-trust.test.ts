import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { describe, expect, it } from 'vitest'

import { markCopilotFolderTrusted, markCursorWorkspaceTrusted } from '../src/server/index.js'

describe('agent trust preflight', () => {
  it('marks Cursor workspaces trusted using the project trust file', () => {
    withTempWorkspace(({ home, workspace }) => {
      markCursorWorkspaceTrusted(workspace, { homeDir: home })

      const trustedPath = join(
        home,
        '.cursor',
        'projects',
        cursorWorkspaceSlug(realpathSync(workspace)),
        '.workspace-trusted'
      )
      expect(existsSync(trustedPath)).toBe(true)
      expect(JSON.parse(readFileSync(trustedPath, 'utf8'))).toMatchObject({
        workspacePath: realpathSync(workspace)
      })
    })
  })

  it('adds Copilot trusted folders without losing existing config', () => {
    withTempWorkspace(({ home, workspace }) => {
      const configDir = join(home, '.copilot')
      mkdirSync(configDir, { recursive: true })
      writeFileSync(
        join(configDir, 'config.json'),
        `${JSON.stringify({ theme: 'dark', trustedFolders: ['/already'] }, null, 2)}\n`,
        'utf8'
      )

      markCopilotFolderTrusted(workspace, { homeDir: home })

      const config = JSON.parse(readFileSync(join(configDir, 'config.json'), 'utf8'))
      expect(config.theme).toBe('dark')
      expect(config.trustedFolders).toEqual(['/already', realpathSync(workspace)])
    })
  })
})

function withTempWorkspace(callback: (args: { home: string; workspace: string }) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'webtui-trust-'))
  try {
    const home = join(root, 'home')
    const workspace = join(root, 'workspace')
    mkdirSync(home, { recursive: true })
    mkdirSync(workspace, { recursive: true })
    callback({ home, workspace })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

function cursorWorkspaceSlug(absPath: string): string {
  return absPath.replace(/^[\\/]+/, '').replace(/[\\/]+/g, '-')
}
