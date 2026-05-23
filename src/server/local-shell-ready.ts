import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'

import type * as nodePty from 'node-pty'

export type ShellReadyScanState = {
  matchPos: number
  heldBytes: string
}

export type ShellReadyLaunchConfig = {
  args: string[]
  env: Record<string, string>
  supportsReadyMarker: boolean
}

export type StartupCommandState = {
  command: string
  supportsReadyMarker: boolean
}

export const STARTUP_COMMAND_READY_MAX_WAIT_MS = 1500

const OSC_133_A = '\x1b]133;A'
let didEnsureShellReadyWrappers = false

export function createShellReadyScanState(): ShellReadyScanState {
  return { matchPos: 0, heldBytes: '' }
}

export function scanForShellReady(
  state: ShellReadyScanState,
  data: string
): { output: string; matched: boolean } {
  let output = ''

  for (let index = 0; index < data.length; index += 1) {
    const ch = data[index] as string
    if (state.matchPos < OSC_133_A.length) {
      if (ch === OSC_133_A[state.matchPos]) {
        state.heldBytes += ch
        state.matchPos += 1
      } else {
        output += state.heldBytes
        state.heldBytes = ''
        state.matchPos = 0
        if (ch === OSC_133_A[0]) {
          state.heldBytes = ch
          state.matchPos = 1
        } else {
          output += ch
        }
      }
    } else if (ch === '\x07') {
      const remaining = data.slice(index + 1)
      state.heldBytes = ''
      state.matchPos = 0
      return { output: output + remaining, matched: true }
    } else {
      state.heldBytes += ch
    }
  }

  return { output, matched: false }
}

export function getShellReadyLaunchConfig(shellPath: string): ShellReadyLaunchConfig | null {
  const shellName = basename(shellPath).toLowerCase()
  if (process.platform === 'win32') {
    return null
  }

  if (shellName === 'zsh') {
    ensureShellReadyWrappers()
    return {
      args: ['-l'],
      env: {
        WEBTUI_ORIG_ZDOTDIR: resolveOriginalZdotdir(),
        ZDOTDIR: join(getShellReadyWrapperRoot(), 'zsh'),
        WEBTUI_SHELL_READY_MARKER: '1'
      },
      supportsReadyMarker: true
    }
  }

  if (shellName === 'bash') {
    ensureShellReadyWrappers()
    return {
      args: ['--rcfile', join(getShellReadyWrapperRoot(), 'bash', 'rcfile')],
      env: {
        WEBTUI_SHELL_READY_MARKER: '1'
      },
      supportsReadyMarker: true
    }
  }

  return null
}

export function writeStartupCommand(proc: nodePty.IPty, startupCommand: string): void {
  const submit = process.platform === 'win32' ? '\r' : '\n'
  const endsWithSubmit = startupCommand.endsWith('\r') || startupCommand.endsWith('\n')
  proc.write(endsWithSubmit ? startupCommand : `${startupCommand}${submit}`)
}

function getShellReadyWrapperRoot(): string {
  return join(tmpdir(), 'webtui-shell-ready')
}

function quotePosixSingle(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function normalizeOriginalZdotdirCandidate(value: string | undefined): string | null {
  if (!value) {
    return null
  }
  const normalized = value.replace(/\/+$/, '')
  if (!normalized || normalized.endsWith('/webtui-shell-ready/zsh')) {
    return null
  }
  return value
}

function resolveOriginalZdotdir(): string {
  return (
    normalizeOriginalZdotdirCandidate(process.env.ZDOTDIR) ||
    normalizeOriginalZdotdirCandidate(process.env.WEBTUI_ORIG_ZDOTDIR) ||
    process.env.HOME ||
    ''
  )
}

function ensureShellReadyWrappers(): void {
  if (didEnsureShellReadyWrappers || process.platform === 'win32') {
    return
  }
  didEnsureShellReadyWrappers = true

  const root = getShellReadyWrapperRoot()
  const zshDir = join(root, 'zsh')
  const bashDir = join(root, 'bash')

  const zshEnv = `# webtui zsh shell-ready wrapper
export WEBTUI_ORIG_ZDOTDIR="\${WEBTUI_ORIG_ZDOTDIR:-$HOME}"
case "\${WEBTUI_ORIG_ZDOTDIR%/}" in
  */webtui-shell-ready/zsh) export WEBTUI_ORIG_ZDOTDIR="$HOME" ;;
esac
[[ -f "$WEBTUI_ORIG_ZDOTDIR/.zshenv" ]] && source "$WEBTUI_ORIG_ZDOTDIR/.zshenv"
export ZDOTDIR=${quotePosixSingle(zshDir)}
`
  const zshProfile = `# webtui zsh shell-ready wrapper
_webtui_home="\${WEBTUI_ORIG_ZDOTDIR:-$HOME}"
case "\${_webtui_home%/}" in
  */webtui-shell-ready/zsh) _webtui_home="$HOME" ;;
esac
[[ -f "$_webtui_home/.zprofile" ]] && source "$_webtui_home/.zprofile"
`
  const zshRc = `# webtui zsh shell-ready wrapper
_webtui_home="\${WEBTUI_ORIG_ZDOTDIR:-$HOME}"
case "\${_webtui_home%/}" in
  */webtui-shell-ready/zsh) _webtui_home="$HOME" ;;
esac
if [[ -o interactive && -f "$_webtui_home/.zshrc" ]]; then
  source "$_webtui_home/.zshrc"
fi
`
  const zshLogin = `# webtui zsh shell-ready wrapper
_webtui_home="\${WEBTUI_ORIG_ZDOTDIR:-$HOME}"
case "\${_webtui_home%/}" in
  */webtui-shell-ready/zsh) _webtui_home="$HOME" ;;
esac
if [[ -o interactive && -f "$_webtui_home/.zlogin" ]]; then
  source "$_webtui_home/.zlogin"
fi
if [[ "\${WEBTUI_SHELL_READY_MARKER:-0}" == "1" ]]; then
  __webtui_prompt_mark() {
    printf "\\033]133;A\\007"
  }
  autoload -Uz add-zle-hook-widget
  zle -N __webtui_prompt_mark
  add-zle-hook-widget line-init __webtui_prompt_mark
fi
`
  const bashRc = `# webtui bash shell-ready wrapper
[[ -f /etc/profile ]] && source /etc/profile
if [[ -f "$HOME/.bash_profile" ]]; then
  source "$HOME/.bash_profile"
elif [[ -f "$HOME/.bash_login" ]]; then
  source "$HOME/.bash_login"
elif [[ -f "$HOME/.profile" ]]; then
  source "$HOME/.profile"
fi
if [[ "\${WEBTUI_SHELL_READY_MARKER:-0}" == "1" ]]; then
  __webtui_prompt_mark() {
    printf "\\033]133;A\\007"
  }
  if [[ "$(declare -p PROMPT_COMMAND 2>/dev/null)" == "declare -a"* ]]; then
    PROMPT_COMMAND=("\${PROMPT_COMMAND[@]}" "__webtui_prompt_mark")
  else
    _webtui_prev_prompt_command="\${PROMPT_COMMAND}"
    if [[ -n "\${_webtui_prev_prompt_command}" ]]; then
      PROMPT_COMMAND="\${_webtui_prev_prompt_command};__webtui_prompt_mark"
    else
      PROMPT_COMMAND="__webtui_prompt_mark"
    fi
  fi
fi
`

  const files = [
    [join(zshDir, '.zshenv'), zshEnv],
    [join(zshDir, '.zprofile'), zshProfile],
    [join(zshDir, '.zshrc'), zshRc],
    [join(zshDir, '.zlogin'), zshLogin],
    [join(bashDir, 'rcfile'), bashRc]
  ] as const

  for (const [path, content] of files) {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content, 'utf8')
    chmodSync(path, 0o644)
  }
}
