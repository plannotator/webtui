import { describe, expect, it } from 'vitest'

import { createTerminalEnvironment, NodePtyBackend } from '../src/server/index.js'

describe('node-pty backend', () => {
  it('spawns a real local process and streams output', async () => {
    const backend = new NodePtyBackend()
    const command = `${JSON.stringify(process.execPath)} -e "console.log('webtui-backend')"`
    const session = await backend.spawn({ command, cols: 80, rows: 24 })

    const output = await new Promise<string>((resolve, reject) => {
      let buffer = ''
      const timeout = setTimeout(() => reject(new Error('timed out waiting for PTY output')), 8000)
      session.onData((data) => {
        buffer += data
        if (buffer.includes('webtui-backend')) {
          clearTimeout(timeout)
          resolve(buffer)
        }
      })
    })

    expect(output).toContain('webtui-backend')
    session.kill()
  })

  it('supports resize and kill calls', async () => {
    const backend = new NodePtyBackend()
    const session = await backend.spawn({
      command: `${JSON.stringify(process.execPath)} -e "setTimeout(()=>{}, 5000)"`
    })

    expect(() => session.resize(100, 32)).not.toThrow()
    expect(() => session.kill()).not.toThrow()
  })

  it('uses color-capable terminal environment defaults', () => {
    const env = createTerminalEnvironment({
      base: { NO_COLOR: '1', LANG: undefined },
      backend: { TERM: 'dumb' },
      session: { COLORTERM: 'false' }
    })

    expect(env.NO_COLOR).toBeUndefined()
    expect(env.TERM).toBe('xterm-256color')
    expect(env.COLORTERM).toBe('truecolor')
    expect(env.TERM_PROGRAM).toBe('webtui')
    expect(env.TERM_PROGRAM_VERSION).toBe('0.0.0-local')
    expect(env.FORCE_HYPERLINK).toBe('1')
    expect(env.LANG).toBe('en_US.UTF-8')
  })
})
