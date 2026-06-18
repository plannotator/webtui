import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createBracketedPastePayload, type PtySession, type Unsubscribe } from '../src/core/index.js'

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit(): void {
      // no-op
    }
  }
}))

vi.mock('@xterm/addon-unicode11', () => ({
  Unicode11Addon: class {}
}))

vi.mock('@xterm/addon-web-links', () => ({
  WebLinksAddon: class {
    dispose(): void {
      // no-op
    }
  }
}))

vi.mock('@xterm/addon-webgl', () => ({
  WebglAddon: class {
    onContextLoss(): void {
      // no-op
    }
    dispose(): void {
      // no-op
    }
  }
}))

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    cols = 80
    rows = 24
    options = { fontSize: 14 }
    parser = {
      handlers: [] as Array<{ id: { prefix?: string; final: string }; callback: (params: (number | number[])[]) => boolean }>,
      registerCsiHandler: (
        id: { prefix?: string; final: string },
        callback: (params: (number | number[])[]) => boolean
      ) => {
        this.parser.handlers.push({ id, callback })
        return { dispose: () => undefined }
      }
    }
    unicode = { activeVersion: '6' }
    element = null
    textarea = null
    buffer = {
      active: {
        baseY: 0,
        viewportY: 0,
        cursorX: 0,
        cursorY: 0,
        getLine: () => null
      }
    }

    open(): void {
      // no-op
    }
    loadAddon(): void {
      // no-op
    }
    onTitleChange(): { dispose(): void } {
      return { dispose: () => undefined }
    }
    onData(): { dispose(): void } {
      return { dispose: () => undefined }
    }
    onResize(): { dispose(): void } {
      return { dispose: () => undefined }
    }
    attachCustomKeyEventHandler(): void {
      // no-op
    }
    write(_data: string, callback?: () => void): void {
      if (_data.includes('\x1b[?2031h')) {
        for (const handler of this.parser.handlers) {
          if (handler.id.prefix === '?' && handler.id.final === 'h') {
            handler.callback([2031])
          }
        }
      }
      if (_data.includes('\x1b[?2031l')) {
        for (const handler of this.parser.handlers) {
          if (handler.id.prefix === '?' && handler.id.final === 'l') {
            handler.callback([2031])
          }
        }
      }
      callback?.()
    }
    refresh(): void {
      // no-op
    }
    getSelection(): string {
      return ''
    }
    dispose(): void {
      // no-op
    }
  }
}))

describe('terminal session sendAgentMessage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses immediate paste for command-only sessions', async () => {
    const { createAgentTerminalSession } = await import('../src/browser/index.js')
    const pty = createPtySession()
    const session = await createAgentTerminalSession({
      container: createContainer(),
      backend: { spawn: () => Promise.resolve(pty) },
      command: 'bash',
      terminalLinks: false,
      terminalGpuAcceleration: 'off'
    })

    expect(session.launchPlan).toBeNull()
    expect(session.sendAgentMessage({ text: ' run tests ' })).toBe(true)

    await Promise.resolve()
    expect(pty.writes).toEqual([createBracketedPastePayload('run tests')])

    await vi.advanceTimersByTimeAsync(50)
    expect(pty.writes).toEqual([createBracketedPastePayload('run tests'), '\r'])
    session.dispose()
  })

  it('does not wait for a quiet window during runtime agent output', async () => {
    const { createAgentTerminalSession } = await import('../src/browser/index.js')
    const pty = createPtySession()
    const session = await createAgentTerminalSession({
      container: createContainer(),
      backend: { spawn: () => Promise.resolve(pty) },
      agent: 'autohand',
      prompt: null,
      terminalLinks: false,
      terminalGpuAcceleration: 'off'
    })

    pty.emit('\x1b[?2004hstreaming output')
    expect(session.sendAgentMessage({ text: 'follow up' })).toBe(true)

    await Promise.resolve()
    expect(pty.writes).toEqual([createBracketedPastePayload('follow up')])

    await vi.advanceTimersByTimeAsync(50)
    expect(pty.writes).toEqual([createBracketedPastePayload('follow up'), '\r'])
    session.dispose()
  })

  it('answers terminal color-scheme subscription requests', async () => {
    const { createAgentTerminalSession } = await import('../src/browser/index.js')
    const pty = createPtySession()
    const session = await createAgentTerminalSession({
      container: createContainer(),
      backend: { spawn: () => Promise.resolve(pty) },
      command: 'bash',
      terminalColorScheme: 'dark',
      terminalLinks: false,
      terminalGpuAcceleration: 'off'
    })

    pty.emit('\x1b[?2031h')
    expect(pty.writes).toEqual(['\x1b[?997;1n'])

    session.setTerminalColorScheme('light')
    expect(pty.writes).toEqual(['\x1b[?997;1n', '\x1b[?997;2n'])

    pty.emit('\x1b[?2031l')
    session.setTerminalColorScheme('dark')
    expect(pty.writes).toEqual(['\x1b[?997;1n', '\x1b[?997;2n'])
    session.dispose()
  })
})

function createContainer(): HTMLElement {
  return {
    addEventListener: () => undefined,
    removeEventListener: () => undefined
  } as unknown as HTMLElement
}

function createPtySession(): PtySession & {
  writes: string[]
  emit(data: string): void
} {
  const listeners = new Set<(data: string) => void>()
  const writes: string[] = []
  return {
    id: 'test',
    writes,
    emit(data: string): void {
      for (const listener of listeners) {
        listener(data)
      }
    },
    write(data: string): void {
      writes.push(data)
    },
    resize: () => undefined,
    kill: () => undefined,
    onData(callback: (data: string) => void): Unsubscribe {
      listeners.add(callback)
      return () => listeners.delete(callback)
    },
    onExit: () => () => undefined
  }
}
