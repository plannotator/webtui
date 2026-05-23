import type { Terminal } from '@xterm/xterm'

export type TerminalFontZoomDirection = 'in' | 'out' | 'reset'

export type TerminalFontZoomOptions = {
  enabled?: boolean
  min?: number
  max?: number
  step?: number
  defaultSize?: number
}

export type TerminalFontZoomConfig = boolean | TerminalFontZoomOptions

export type ResolvedTerminalFontZoomOptions = {
  enabled: boolean
  min: number
  max: number
  step: number
  defaultSize: number
}

export type TerminalFontZoomShortcutInput = {
  type?: string
  key?: string
  code?: string
  altKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
}

export type TerminalFontZoomController = {
  getFontSize(): number
  setFontSize(size: number): number
  zoomFont(direction: TerminalFontZoomDirection): number
  zoomFontIn(): number
  zoomFontOut(): number
  resetFontZoom(): number
  handleKeyboardEvent(event: KeyboardEvent): boolean
}

const FALLBACK_FONT_SIZE = 14
const DEFAULT_MIN_FONT_SIZE = 8
const DEFAULT_MAX_FONT_SIZE = 32
const DEFAULT_FONT_SIZE_STEP = 1

export function resolveTerminalFontZoomOptions(
  config: TerminalFontZoomConfig | undefined,
  initialFontSize = FALLBACK_FONT_SIZE
): ResolvedTerminalFontZoomOptions {
  const options = typeof config === 'object' ? config : undefined
  const defaultSize = sanitizePositiveNumber(options?.defaultSize, initialFontSize)
  const min = Math.min(sanitizePositiveNumber(options?.min, DEFAULT_MIN_FONT_SIZE), defaultSize)
  const max = Math.max(
    sanitizePositiveNumber(options?.max, DEFAULT_MAX_FONT_SIZE),
    defaultSize,
    min
  )

  return {
    enabled: typeof config === 'boolean' ? config : config !== undefined && options?.enabled !== false,
    min,
    max,
    step: sanitizePositiveNumber(options?.step, DEFAULT_FONT_SIZE_STEP),
    defaultSize: clamp(defaultSize, min, max)
  }
}

export function resolveTerminalFontZoomShortcut(
  input: TerminalFontZoomShortcutInput,
  isMac = isMacUserAgent()
): TerminalFontZoomDirection | null {
  if (input.type !== 'keydown') {
    return null
  }

  const primaryModifier = isMac ? Boolean(input.metaKey) : Boolean(input.ctrlKey)
  const oppositeModifier = isMac ? Boolean(input.ctrlKey) : Boolean(input.metaKey)
  if (!primaryModifier || oppositeModifier || input.altKey) {
    return null
  }

  const key = (input.key ?? '').toLowerCase()
  const code = (input.code ?? '').toLowerCase()
  if (key === '=' || key === '+' || code === 'numpadadd') {
    return 'in'
  }
  if (
    key === '-' ||
    key === '_' ||
    key.includes('minus') ||
    key.includes('subtract') ||
    code.includes('minus') ||
    code.includes('subtract')
  ) {
    return 'out'
  }
  if (!input.shiftKey && (key === '0' || code === 'digit0' || code === 'numpad0')) {
    return 'reset'
  }
  return null
}

export function getNextTerminalFontSize(
  currentSize: number,
  direction: TerminalFontZoomDirection,
  options: ResolvedTerminalFontZoomOptions
): number {
  if (direction === 'reset') {
    return options.defaultSize
  }
  const delta = direction === 'in' ? options.step : -options.step
  return clamp(roundFontSize(currentSize + delta), options.min, options.max)
}

export function createTerminalFontZoomController(args: {
  terminal: Terminal
  config: TerminalFontZoomConfig | undefined
  onChange?: (fontSize: number) => void
  isMac?: () => boolean
}): TerminalFontZoomController {
  const options = resolveTerminalFontZoomOptions(
    args.config,
    sanitizePositiveNumber(args.terminal.options.fontSize, FALLBACK_FONT_SIZE)
  )

  const setFontSize = (size: number): number => {
    const nextSize = clamp(sanitizePositiveNumber(size, options.defaultSize), options.min, options.max)
    args.terminal.options.fontSize = nextSize
    args.onChange?.(nextSize)
    return nextSize
  }

  const zoomFont = (direction: TerminalFontZoomDirection): number =>
    setFontSize(getNextTerminalFontSize(getTerminalFontSize(args.terminal), direction, options))

  return {
    getFontSize(): number {
      return getTerminalFontSize(args.terminal)
    },
    setFontSize,
    zoomFont,
    zoomFontIn(): number {
      return zoomFont('in')
    },
    zoomFontOut(): number {
      return zoomFont('out')
    },
    resetFontZoom(): number {
      return zoomFont('reset')
    },
    handleKeyboardEvent(event: KeyboardEvent): boolean {
      if (!options.enabled) {
        return false
      }
      const direction = resolveTerminalFontZoomShortcut(event, args.isMac?.() ?? isMacUserAgent())
      if (!direction) {
        return false
      }
      event.preventDefault()
      event.stopPropagation()
      zoomFont(direction)
      return true
    }
  }
}

function getTerminalFontSize(terminal: Terminal): number {
  return sanitizePositiveNumber(terminal.options.fontSize, FALLBACK_FONT_SIZE)
}

function sanitizePositiveNumber(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function roundFontSize(value: number): number {
  return Math.round(value * 100) / 100
}

function isMacUserAgent(): boolean {
  return globalThis.navigator?.userAgent.includes('Mac') ?? false
}
