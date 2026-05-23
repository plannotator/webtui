import { describe, expect, it } from 'vitest'

import { extractTerminalFileLinks } from '../src/browser/index.js'

describe('terminal links', () => {
  it('extracts relative file links with line and column locations', () => {
    const links = extractTerminalFileLinks('open src/App.tsx:42:7.')

    expect(links).toEqual([
      {
        startIndex: 5,
        endIndex: 21,
        text: 'src/App.tsx',
        line: 42,
        column: 7
      }
    ])
  })

  it('extracts absolute POSIX paths without swallowing punctuation', () => {
    const links = extractTerminalFileLinks('see /tmp/project/file.ts:12;')

    expect(links).toEqual([
      {
        startIndex: 4,
        endIndex: 27,
        text: '/tmp/project/file.ts',
        line: 12,
        column: null
      }
    ])
  })
})
