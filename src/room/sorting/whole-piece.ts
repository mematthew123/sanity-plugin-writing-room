/** Markdown pasted as plain text keeps its marks, so a placed line may begin with one. */
export const unmarked = (text: string) => text.trim().replace(/^#{1,6}\s+/, '').trim()

/** A body block as the room reads it for Sorting: only its key and its words matter. */
export interface BodyBlock {
  _key?: string
  _type?: string
  children?: Array<{text?: unknown}>
}

export function blockText(block: BodyBlock): string {
  if (block._type !== 'block') return ''
  return (block.children ?? []).map((child) => (typeof child.text === 'string' ? child.text : '')).join('')
}

/** The blocks that have words in them. A paste from Google Docs is a third empty lines. */
export function writtenBlocks(body: unknown): Array<{id: string; text: string}> {
  if (!Array.isArray(body)) return []
  return (body as BodyBlock[]).flatMap((block) => {
    const text = blockText(block).trim()
    return text && block._key ? [{id: block._key, text}] : []
  })
}

export function bodyIsEmpty(body: unknown): boolean {
  if (!Array.isArray(body)) return true
  return (body as BodyBlock[]).every((block) => block._type === 'block' && !blockText(block).trim())
}

/** Starting guesses, to be tuned by hand. */
export const WHOLE_PIECE = {blocks: 3, words: 150} as const

/**
 * Whether what's in the body reads as a complete piece and not a passage to work with: enough
 * blocks and enough words. Only asked of a body that was empty before the paste.
 */
export function isWholePiece(body: unknown): boolean {
  const blocks = writtenBlocks(body)
  if (blocks.length < WHOLE_PIECE.blocks) return false
  const words = blocks.reduce((count, block) => count + block.text.split(/\s+/).filter(Boolean).length, 0)
  return words >= WHOLE_PIECE.words
}
