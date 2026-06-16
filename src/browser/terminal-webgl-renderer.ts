import { WebglAddon } from '@xterm/addon-webgl'
import type { FitAddon } from '@xterm/addon-fit'
import type { Terminal } from '@xterm/xterm'

export type TerminalGpuAcceleration = 'auto' | 'on' | 'off'

export type TerminalWebglRenderer = {
  dispose(): void
}

let suggestedRendererType: 'dom' | undefined

export function resetTerminalWebglSuggestion(): void {
  suggestedRendererType = undefined
}

export function attachTerminalWebglRenderer(args: {
  terminal: Terminal
  fitAddon: FitAddon
  mode?: TerminalGpuAcceleration
}): TerminalWebglRenderer {
  const mode = args.mode ?? 'auto'
  let webglDisabledAfterContextLoss = false
  let webglAddon: WebglAddon | null = null

  const disposeWebgl = (options?: { refreshDimensions?: boolean }): void => {
    if (!webglAddon) {
      return
    }
    try {
      webglAddon.dispose()
    } catch {
      /* ignore */
    }
    webglAddon = null
    if (options?.refreshDimensions) {
      // DOM and WebGL can measure cells slightly differently; refit after a
      // fallback so the PTY and renderer stay aligned.
      globalThis.requestAnimationFrame?.(() => {
        try {
          args.fitAddon.fit()
          args.terminal.refresh(0, args.terminal.rows - 1)
        } catch {
          /* terminal may have been disposed */
        }
      })
    }
  }

  const shouldUseWebgl = (): boolean => {
    if (mode === 'off') {
      return false
    }
    if (mode === 'on') {
      return true
    }
    return suggestedRendererType === undefined && !webglDisabledAfterContextLoss
  }

  const attachWebgl = (): void => {
    if (!shouldUseWebgl()) {
      return
    }
    try {
      const addon = new WebglAddon()
      addon.onContextLoss(() => {
        console.warn('[webtui] WebGL context lost; falling back to xterm DOM renderer')
        webglDisabledAfterContextLoss = true
        disposeWebgl({ refreshDimensions: true })
      })
      args.terminal.loadAddon(addon)
      webglAddon = addon
    } catch (err) {
      if (mode === 'auto') {
        suggestedRendererType = 'dom'
      }
      console.warn('[webtui] WebGL unavailable; using xterm DOM renderer:', err)
      webglAddon = null
    }
  }

  attachWebgl()

  return {
    dispose(): void {
      disposeWebgl()
    }
  }
}
