import {useMemo} from 'react'
import {type SchemaType, useSchema} from 'sanity'
import {useWritingRoomConfig, type WritingRoomTypeOptions} from '../config'
import {detectFields, type WritingFields} from './fields'

/** One kind of writing the room does, named the way the Writer sees it. */
export interface WritingKind {
  type: string
  /** "Post", "Case Study". */
  singular: string
  /** "Posts", "Case Studies". */
  plural: string
  /** Where the room reads and writes in this type. */
  fields: WritingFields
  /** The image field's title ("Cover Image", "Main image"), for the nudge after a publish. */
  imageTitle?: string
}

const FALLBACK_FIELDS: WritingFields = {title: 'title', body: 'body', slug: 'slug', publishedAt: 'publishedAt'}

const warned = new Set<string>()

/** Warns once per message, since kinds are resolved on every render and every document action. */
function warnOnce(message: string) {
  if (warned.has(message)) return
  warned.add(message)
  console.warn(`[sanity-plugin-writing-room] ${message}`)
}

/** "Post" → "Posts", "Case Study" → "Case Studies", "Box" → "Boxes". Set `pluralTitle` for the rest. */
export function pluralize(title: string): string {
  if (/[^aeiou]y$/i.test(title)) return `${title.slice(0, -1)}ies`
  if (/(s|x|z|ch|sh)$/i.test(title)) return `${title}es`
  return `${title}s`
}

/** "post" → "Post", "caseStudy" → "Case Study": used when a schema type has no title. */
function titleFromName(name: string): string {
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * Names each configured type and finds its fields, from the options first and the schema second.
 * Types the room can't write (missing from the schema, or with no title or body) are left out,
 * with a warning.
 */
export function resolveKinds(
  types: WritingRoomTypeOptions[],
  getSchemaType: (name: string) => SchemaType | undefined,
): WritingKind[] {
  return types.flatMap((option) => {
    const schemaType = getSchemaType(option.type)
    if (!schemaType) {
      warnOnce(`"${option.type}" is in \`types\` but not in the Studio's schema, so the room leaves it out.`)
      return []
    }
    const detected = detectFields(schemaType, option.fields)
    if ('problem' in detected) {
      warnOnce(`${detected.problem} The room leaves it out.`)
      return []
    }
    const singular = option.title ?? schemaType.title ?? titleFromName(option.type)
    return [
      {
        type: option.type,
        singular,
        plural: option.pluralTitle ?? pluralize(singular),
        ...detected,
      },
    ]
  })
}

/** Every kind of writing the room does, default first. */
export function useWritingKinds(): WritingKind[] {
  const {types} = useWritingRoomConfig()
  const schema = useSchema()
  return useMemo(() => resolveKinds(types, (name) => schema.get(name)), [types, schema])
}

/** The kind for one of the room's document types. */
export function useWritingKind(documentType: string): WritingKind {
  const kinds = useWritingKinds()
  return (
    kinds.find((kind) => kind.type === documentType) ?? {
      type: documentType,
      singular: titleFromName(documentType),
      plural: pluralize(titleFromName(documentType)),
      fields: FALLBACK_FIELDS,
    }
  )
}

/** The room's document type names, default first, for routing. */
export function useWritingTypes(): string[] {
  const {types} = useWritingRoomConfig()
  return useMemo(() => types.map((option) => option.type), [types])
}
