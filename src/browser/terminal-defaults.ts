import { Terminal, type ITerminalOptions, type ITheme } from '@xterm/xterm'

import { WEBTUI_GHOSTTY_DARK_THEME } from './themes.js'

export const DEFAULT_WEBTUI_THEME: ITheme = WEBTUI_GHOSTTY_DARK_THEME

export const DEFAULT_WEBTUI_FONT_FAMILY =
  '"SF Mono", "Menlo", "Monaco", "Cascadia Mono", "Consolas", ' +
  '"DejaVu Sans Mono", "Liberation Mono", "Symbols Nerd Font Mono", ' +
  '"MesloLGS Nerd Font", "JetBrainsMono Nerd Font", "Hack Nerd Font", monospace'

export function createWebTuiTerminal(options?: ITerminalOptions): Terminal {
  return new Terminal({
    cursorBlink: true,
    cursorStyle: 'bar',
    scrollback: 5000,
    fontFamily: DEFAULT_WEBTUI_FONT_FAMILY,
    fontSize: 14,
    fontWeight: '300',
    fontWeightBold: '500',
    allowTransparency: false,
    convertEol: true,
    drawBoldTextInBrightColors: true,
    macOptionClickForcesSelection: true,
    vtExtensions: {
      kittyKeyboard: true
    },
    theme: DEFAULT_WEBTUI_THEME,
    ...options,
    // Unicode11Addon uses xterm's proposed unicode API. Keep this enabled even
    // if a host passes partial terminalOptions.
    allowProposedApi: true
  })
}
