/**
 * What the room sends to the Sorting route and what comes back. The room and the route can be on
 * different versions of the package, so this shape is a contract: change it by adding a version.
 */
export const SORTING_VERSION = 1

/** A block from the top or the foot of the pasted piece. Empty blocks are never sent. */
export interface SortingBlock {
  /** The room's own key for the block; the route only hands it back. */
  id: string
  text: string
  edge: 'top' | 'bottom'
}

export interface SortingOption {
  /** The room's own id for the answer (a document id, a list value); the route only hands it back. */
  id: string
  label: string
}

interface FieldBase {
  name: string
  /** The field's title and description in the schema: what tells the model what the field is for. */
  title: string
  description?: string
}

/** A field that takes text from the paste. */
export interface SortingTextField extends FieldBase {
  kind: 'text'
}

/** A field that takes one or several of the answers it already offers. */
export interface SortingPickField extends FieldBase {
  kind: 'pick'
  many: boolean
  options: SortingOption[]
}

/**
 * A field that takes a list of the Writer's own words, with no set answers: free-form tags. It is
 * filled only from a label line ("Tags: portugal, city breaks"), whose items are placed as they are.
 */
export interface SortingListField extends FieldBase {
  kind: 'list'
}

export type SortingField = SortingTextField | SortingPickField | SortingListField

export interface SortingRequest {
  version: typeof SORTING_VERSION
  /** In the order they were pasted: the top edge, then the foot. */
  blocks: SortingBlock[]
  /** The running text that follows the top edge, for picks judged by what the piece is about. */
  opening: string
  /** Only fields that are empty, visible and editable for this Writer. */
  fields: SortingField[]
}

export interface SortingResponse {
  version: typeof SORTING_VERSION
  /** The block that is the piece's headline. The room decides whether it becomes the title. */
  headline: {block: string; confidence: number} | null
  /** Text fields and the block that moves into each. A block is placed at most once. */
  placed: Array<{field: string; block: string; confidence: number}>
  picked: Array<{
    field: string
    /** Option ids. */
    options: string[]
    /** Stated when the paste names it, judged when it follows from what the piece is about. */
    kind: 'stated' | 'judged'
    /** The label line to take out of the body, when the pick came from one and succeeded in full. */
    line: string | null
    confidence: number
  }>
  /** List fields and the items their label line names. The line always leaves the body. */
  listed: Array<{field: string; values: string[]; line: string; confidence: number}>
}

export const LIMITS = {
  /** Bytes of request body the route will read. */
  body: 256 * 1024,
  blocks: 24,
  blockText: 600,
  opening: 6000,
  fields: 40,
  /** A Choice takes at most 255 options; one is kept for "none of these". */
  options: 254,
  /**
   * Yes-or-no questions one request spends on judging the answers of fields that take several:
   * one per answer. The model reads every question in one call, inside one context and one
   * timeout, so a field whose answers don't fit is filled from a label line or not at all.
   */
  judged: 60,
  label: 200,
  description: 400,
} as const

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (value: unknown, max: number): string | null =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null

function parseField(value: unknown): SortingField | string {
  if (!isRecord(value)) return 'A field must be an object.'
  const name = text(value.name, LIMITS.label)
  const title = text(value.title, LIMITS.label)
  if (!name || !title) return 'A field needs a name and a title.'
  const description = text(value.description, LIMITS.description) ?? undefined
  if (value.kind === 'text') return {kind: 'text', name, title, description}
  if (value.kind === 'list') return {kind: 'list', name, title, description}
  if (value.kind !== 'pick') return `"${name}" has a kind the route doesn't know.`
  if (!Array.isArray(value.options) || value.options.length === 0) return `"${name}" has no options.`
  if (value.options.length > LIMITS.options) return `"${name}" has more than ${LIMITS.options} options.`
  const options: SortingOption[] = []
  for (const option of value.options) {
    const id = isRecord(option) ? text(option.id, LIMITS.label) : null
    const label = isRecord(option) ? text(option.label, LIMITS.label) : null
    if (!id || !label) return `An option of "${name}" needs an id and a label.`
    options.push({id, label})
  }
  return {kind: 'pick', name, title, description, many: value.many === true, options}
}

/** Checks a request body and trims its text to the limits. Never throws. */
export function parseSortingRequest(body: unknown): {request: SortingRequest} | {problem: string} {
  if (!isRecord(body)) return {problem: 'The request must be an object.'}
  if (body.version !== SORTING_VERSION) return {problem: `The route speaks version ${SORTING_VERSION}.`}
  if (!Array.isArray(body.blocks) || body.blocks.length === 0) return {problem: 'There are no blocks to sort.'}
  if (body.blocks.length > LIMITS.blocks) return {problem: `More than ${LIMITS.blocks} blocks.`}
  if (!Array.isArray(body.fields)) return {problem: '`fields` must be a list.'}
  if (body.fields.length > LIMITS.fields) return {problem: `More than ${LIMITS.fields} fields.`}

  const blocks: SortingBlock[] = []
  const seen = new Set<string>()
  for (const block of body.blocks) {
    const id = isRecord(block) ? text(block.id, LIMITS.label) : null
    const blockText = isRecord(block) ? text(block.text, LIMITS.blockText) : null
    const edge = isRecord(block) ? block.edge : null
    if (!id || !blockText || (edge !== 'top' && edge !== 'bottom')) {
      return {problem: 'A block needs an id, some text and an edge.'}
    }
    if (seen.has(id)) return {problem: `The block "${id}" is listed twice.`}
    seen.add(id)
    blocks.push({id, text: blockText, edge})
  }

  const fields: SortingField[] = []
  const names = new Set<string>()
  for (const value of body.fields) {
    const field = parseField(value)
    if (typeof field === 'string') return {problem: field}
    if (names.has(field.name)) return {problem: `The field "${field.name}" is listed twice.`}
    names.add(field.name)
    fields.push(field)
  }

  const opening = typeof body.opening === 'string' ? body.opening.trim().slice(0, LIMITS.opening) : ''
  return {request: {version: SORTING_VERSION, blocks, opening, fields}}
}
