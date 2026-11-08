interface Node {
  _type?: string
  children?: Array<{text?: unknown}>
  code?: unknown
  caption?: unknown
}

const WORDS_PER_MINUTE = 238

function countWords(text: string): number {
  return text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length
}

/** Words in a Post's body: prose, captions and code, never ornaments. */
export function wordCount(body: unknown): number {
  if (!Array.isArray(body)) return 0
  let words = 0
  for (const node of body as Node[]) {
    if (node._type === 'block') {
      words += countWords((node.children ?? []).map((child) => (typeof child.text === 'string' ? child.text : '')).join(''))
    } else {
      if (typeof node.code === 'string') words += countWords(node.code)
      if (typeof node.caption === 'string') words += countWords(node.caption)
    }
  }
  return words
}

/** "6 min read", or null before there's anything to read. */
export function readingTime(words: number): string | null {
  if (words === 0) return null
  return `${Math.ceil(words / WORDS_PER_MINUTE)} min read`
}
