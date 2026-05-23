export const BRACKETED_PASTE_BEGIN = '\x1b[200~'
export const BRACKETED_PASTE_END = '\x1b[201~'
export const DECSET_BRACKETED_PASTE = '\x1b[?2004h'

export function createBracketedPastePayload(content: string): string {
  return `${BRACKETED_PASTE_BEGIN}${content}${BRACKETED_PASTE_END}`
}
