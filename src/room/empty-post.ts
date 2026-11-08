interface Block {
  _type?: string
  children?: Array<{text?: unknown}>
}

/** System fields every document has; they say nothing about whether the Writer saved any work. */
const SYSTEM_FIELDS = new Set(['_id', '_type', '_rev', '_createdAt', '_updatedAt', '_system'])

/** Whether a Detail holds anything the Writer entered: text, a tag, an image asset… */
function hasContent(value: unknown): boolean {
  if (typeof value === 'string') return value.trim() !== ''
  if (Array.isArray(value)) return value.some(hasContent)
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([key, inner]) => key !== '_type' && key !== '_key' && hasContent(inner))
  }
  return value !== undefined && value !== null && value !== false
}

/**
 * A Post with no title, no words or objects in its body, and no Details (excerpt, cover image,
 * tags, a hand-set slug…): safe to discard when the Writer leaves.
 */
export function isEmptyPost(post: Record<string, unknown> | null | undefined): boolean {
  if (!post) return true
  const {title, body, ...rest} = post
  if (typeof title === 'string' && title.trim()) return false
  const blocks = Array.isArray(body) ? (body as Block[]) : []
  const bodyIsEmpty = blocks.every(
    (block) =>
      block._type === 'block' &&
      (block.children ?? []).every((child) => typeof child.text !== 'string' || !child.text.trim()),
  )
  if (!bodyIsEmpty) return false
  return !Object.entries(rest).some(([key, value]) => !SYSTEM_FIELDS.has(key) && hasContent(value))
}
