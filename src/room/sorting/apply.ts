import {followingSlug} from '../../lib/slug'
import {type SortingResponse} from '../../sorting/contract'
import {type WritingFields} from '../fields'
import {isEmptyValue, type SortableField} from './sortable-fields'
import {type BodyBlock, blockText} from './whole-piece'

/** Markdown pasted as plain text keeps its marks, so a placed line may begin with one. */
export const unmarked = (text: string) => text.trim().replace(/^#{1,6}\s+/, '').trim()

const sameWords = (a: string, b: string) => {
  const plain = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  return plain(a) === plain(b)
}

export interface Sorted {
  /** The document as it should be after Sorting. */
  next: Record<string, unknown>
  /** Every key Sorting changed, for Undo to put back. */
  touched: string[]
  /** The titles of the Details fields that were filled, in schema order, to name in the message. */
  filled: string[]
  /** The same fields by name, for the marks in Details. */
  filledNames: string[]
  /** Whether the headline became the title. */
  titled: boolean
}

/**
 * What the document becomes when the route's answer is applied. Only empty fields are filled,
 * and text that is placed is moved: every block the answer uses leaves the body, and nothing else
 * does. See docs/adr/0003-sorting-places-and-picks-but-never-writes.md.
 */
export function applySorting({
  document,
  writing,
  sortable,
  response,
  isPublished,
  slugByHand,
  keyGenerator,
}: {
  document: Record<string, unknown>
  writing: WritingFields
  sortable: SortableField[]
  response: SortingResponse
  isPublished: boolean
  /** A slug the Writer typed in Details that may not have reached this copy yet. */
  slugByHand?: string
  keyGenerator: () => string
}): Sorted {
  const body = Array.isArray(document[writing.body]) ? (document[writing.body] as BodyBlock[]) : []
  const textOf = (key: string) => {
    const block = body.find((candidate) => candidate._key === key)
    return block ? unmarked(blockText(block)) : ''
  }
  const next: Record<string, unknown> = {...document}
  const leaving = new Set<string>()
  const filled: string[] = []
  let titled = false
  const byName = new Map(sortable.map((entry) => [entry.field.name, entry]))
  const stillEmpty = (name: string) => isEmptyValue(document[name])

  if (response.headline) {
    const headline = textOf(response.headline.block)
    const title = typeof document[writing.title] === 'string' ? (document[writing.title] as string) : ''
    if (headline && !title.trim()) {
      next[writing.title] = headline
      titled = true
      leaving.add(response.headline.block)
      if (!isPublished && writing.slug) {
        const current = slugByHand ?? (document[writing.slug] as {current?: string} | undefined)?.current
        const slug = followingSlug({previousTitle: title, nextTitle: headline, currentSlug: current})
        if (slug) next[writing.slug] = {_type: 'slug', current: slug}
      }
    } else if (headline && sameWords(headline, title)) {
      // The Writer already typed this title: the pasted copy of it goes, theirs stays.
      leaving.add(response.headline.block)
    }
  }

  for (const placed of response.placed) {
    const entry = byName.get(placed.field)
    const text = textOf(placed.block)
    if (!entry || entry.field.kind !== 'text' || !text || !stillEmpty(placed.field) || leaving.has(placed.block)) continue
    next[placed.field] = text
    leaving.add(placed.block)
    filled.push(placed.field)
  }

  for (const picked of response.picked) {
    const entry = byName.get(picked.field)
    if (!entry || entry.field.kind !== 'pick' || !stillEmpty(picked.field)) continue
    const known = new Set(entry.field.options.map((option) => option.id))
    const options = picked.options.filter((id) => known.has(id))
    if (options.length === 0) continue
    const reference = (id: string) => ({_type: 'reference', _ref: id, ...(entry.weak ? {_weak: true} : {})})
    if (entry.store === 'string') next[picked.field] = options[0]
    else if (entry.store === 'strings') next[picked.field] = options
    else if (entry.store === 'reference') next[picked.field] = reference(options[0]!)
    else next[picked.field] = options.map((id) => ({...reference(id), _key: keyGenerator()}))
    filled.push(picked.field)
    // A label line only leaves when every answer it named was picked, which the route decides.
    if (picked.line && options.length === picked.options.length) leaving.add(picked.line)
  }

  for (const listed of response.listed) {
    const entry = byName.get(listed.field)
    const values = listed.values.map((value) => value.trim()).filter(Boolean)
    if (!entry || entry.field.kind !== 'list' || values.length === 0 || !stillEmpty(listed.field)) continue
    next[listed.field] = values
    leaving.add(listed.line)
    filled.push(listed.field)
  }

  if (leaving.size > 0) next[writing.body] = body.filter((block) => !block._key || !leaving.has(block._key))

  const touched = Object.keys(next).filter((key) => next[key] !== document[key])
  const order = sortable.map((entry) => entry.field.name)
  filled.sort((a, b) => order.indexOf(a) - order.indexOf(b))
  return {
    next,
    touched,
    filled: filled.map((name) => byName.get(name)!.field.title),
    filledNames: filled,
    titled,
  }
}

/** "Excerpt", "Excerpt and author", "Excerpt, author and tags": for the message after Sorting. */
export function sortedMessage({filled, titled}: Pick<Sorted, 'filled' | 'titled'>): string | null {
  if (filled.length === 0) return titled ? 'Sorted. The title is in place.' : null
  const names = filled.map((title, index) => (index === 0 ? title : title.toLowerCase()))
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
  return `Sorted. ${list} ${names.length === 1 ? 'is' : 'are'} in Details.`
}

/** The same value whatever order its keys came back in: a save can return an object's keys reordered. */
function inKeyOrder(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(inKeyOrder)
  if (typeof value !== 'object' || value === null) return value
  const record = value as Record<string, unknown>
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, inKeyOrder(record[key])]),
  )
}

/**
 * What Sorting compares to know the document has been edited since: its content, not its
 * bookkeeping. With `keys`, only those fields: the ones Undo would put back.
 */
export function contentOf(document: Record<string, unknown> | null | undefined, keys?: string[]): string {
  if (!document) return ''
  const content = (keys ?? Object.keys(document).filter((key) => !key.startsWith('_')))
    .slice()
    .sort()
    .map((key) => [key, inKeyOrder(document[key])])
  return JSON.stringify(content)
}
