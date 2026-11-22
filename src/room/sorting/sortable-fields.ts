import {isReferenceSchemaType, type ObjectField, type SchemaType} from 'sanity'
import {type SortingField, type SortingOption} from '../../sorting/contract'
import {LIMITS} from '../../sorting/contract'
import {type WritingFields} from '../fields'

/** A field Sorting may fill, and how its value is stored. */
export interface SortableField {
  field: SortingField
  store: 'string' | 'strings' | 'reference' | 'references'
  /** For references: the document types whose documents are the answers. They are fetched when the Writer says Sort. */
  from?: string[]
  weak?: boolean
}

type Loose = {
  hidden?: unknown
  readOnly?: unknown
  weak?: boolean
  components?: {input?: unknown}
  options?: {list?: unknown; layout?: unknown; filter?: unknown}
}

function chain(type: SchemaType | undefined): SchemaType[] {
  const types: SchemaType[] = []
  for (let current = type; current; current = current.type) types.push(current)
  return types
}

const isOfType = (type: SchemaType, ...names: string[]) => chain(type).some((current) => names.includes(current.name))
const loose = (type: SchemaType) => type as unknown as Loose

/** Empty strings, empty lists and objects with nothing in them count as empty. */
export function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') {
    return Object.entries(value).every(([key, inner]) => key.startsWith('_') && key !== '_ref' ? true : isEmptyValue(inner))
  }
  return false
}

function listOptions(list: unknown): SortingOption[] | null {
  if (!Array.isArray(list) || list.length === 0 || list.length > LIMITS.options) return null
  const options: SortingOption[] = []
  for (const entry of list) {
    if (typeof entry === 'string') options.push({id: entry, label: entry})
    else if (entry && typeof entry === 'object' && typeof (entry as {value?: unknown}).value === 'string') {
      const {value, title} = entry as {value: string; title?: unknown}
      options.push({id: value, label: typeof title === 'string' && title ? title : value})
    } else return null
  }
  return options
}

function referenceTypes(type: SchemaType): string[] | null {
  if (!isReferenceSchemaType(type) || loose(type).options?.filter) return null
  const names = type.to.map((to) => to.name)
  return names.length > 0 ? names : null
}

function describe(field: ObjectField): Pick<SortingField, 'name' | 'title' | 'description'> {
  const description = field.type.description
  return {
    name: field.name,
    title: field.type.title || field.name,
    ...(typeof description === 'string' && description ? {description} : {}),
  }
}

/**
 * The fields of a document Sorting may fill: top-level, empty, and plainly visible and editable.
 * It never touches the title and body (its own business), the slug (it follows the title), the
 * published date, images, booleans, numbers, dates or objects. A field whose `hidden` or
 * `readOnly` is a rule and not a plain yes or no is left alone: only the form can say how it
 * comes out. References with a filter are left alone for the same reason.
 * See docs/adr/0003-sorting-places-and-picks-but-never-writes.md.
 */
export function sortableFields(
  schemaType: SchemaType | undefined,
  document: Record<string, unknown> | null | undefined,
  writing: WritingFields,
): SortableField[] {
  const fields: ObjectField[] = schemaType && 'fields' in schemaType ? schemaType.fields : []
  const own = new Set([writing.title, writing.body, writing.slug, writing.publishedAt, writing.image])
  const sortable: SortableField[] = []

  for (const field of fields) {
    const {type} = field
    if (own.has(field.name)) continue
    if (chain(type).some((current) => loose(current).hidden || loose(current).readOnly || loose(current).components?.input)) continue
    if (!isEmptyValue(document?.[field.name])) continue
    const base = describe(field)
    const options = loose(type).options

    if (type.jsonType === 'string') {
      if (isOfType(type, 'date', 'datetime', 'url', 'email')) continue
      if (options?.list) {
        const answers = listOptions(options.list)
        if (answers) sortable.push({field: {...base, kind: 'pick', many: false, options: answers}, store: 'string'})
      } else {
        sortable.push({field: {...base, kind: 'text'}, store: 'string'})
      }
      continue
    }

    const from = referenceTypes(type)
    if (from) {
      sortable.push({field: {...base, kind: 'pick', many: false, options: []}, store: 'reference', from, weak: loose(type).weak})
      continue
    }

    if (type.jsonType !== 'array' || !('of' in type) || type.of.length === 0) continue
    if (type.of.every((member) => member.jsonType === 'string' && !isOfType(member, 'date', 'datetime'))) {
      if (options?.list) {
        const answers = listOptions(options.list)
        if (answers) sortable.push({field: {...base, kind: 'pick', many: true, options: answers}, store: 'strings'})
      } else if (options?.layout === 'tags') {
        sortable.push({field: {...base, kind: 'list'}, store: 'strings'})
      }
      continue
    }
    const members = type.of.map(referenceTypes)
    if (members.every((member): member is string[] => member !== null)) {
      sortable.push({
        field: {...base, kind: 'pick', many: true, options: []},
        store: 'references',
        from: [...new Set(members.flat())],
        weak: type.of.every((member) => loose(member).weak),
      })
    }
  }
  return sortable.slice(0, LIMITS.fields)
}

/** The fields that preview documents of these types by name, for the labels of their answers. */
export function labelPaths(types: string[], getSchemaType: (name: string) => SchemaType | undefined): string[] {
  const paths = new Set<string>()
  for (const name of types) {
    const select = (getSchemaType(name) as {preview?: {select?: Record<string, unknown>}} | undefined)?.preview?.select
    const title = select?.title
    if (typeof title === 'string' && /^[A-Za-z_]\w*$/.test(title)) paths.add(title)
  }
  for (const fallback of ['title', 'name']) paths.add(fallback)
  return [...paths]
}
