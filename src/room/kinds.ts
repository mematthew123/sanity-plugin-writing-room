import {useMemo} from 'react'
import {type SchemaType, useSchema} from 'sanity'
import {useWritingRoomConfig, type WritingRoomTypeOptions} from '../config'
import {detectFields, hasDetails, type WritingFields} from './fields'

export interface WritingKind {
  type: string
  /** "Post", "Case Study". */
  singular: string
  /** "Posts", "Case Studies". */
  plural: string
  fields: WritingFields
  /** For the nudge after a publish. */
  imageTitle?: string
}

const FALLBACK_FIELDS: WritingFields = {title: 'title', body: 'body', slug: 'slug', publishedAt: 'publishedAt'}

const warned = new Set<string>()

/** Kinds are resolved on every render and document action. */
function warnOnce(message: string) {
  if (warned.has(message)) return
  warned.add(message)
  console.warn(`[sanity-plugin-writing-room] ${message}`)
}

/** Irregular plurals need `pluralTitle`. */
export function pluralize(title: string): string {
  if (/[^aeiou]y$/i.test(title)) return `${title.slice(0, -1)}ies`
  if (/(s|x|z|ch|sh)$/i.test(title)) return `${title}es`
  return `${title}s`
}

/** "caseStudy" → "Case Study", for schema types with no title. */
function titleFromName(name: string): string {
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** Types missing from the schema, or with no title or body, are left out with a warning. */
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

/** Default first. */
export function useWritingKinds(): WritingKind[] {
  const {types} = useWritingRoomConfig()
  const schema = useSchema()
  return useMemo(() => resolveKinds(types, (name) => schema.get(name)), [types, schema])
}

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

/** False when a type is only its title and body, so there's nothing for Details to show. */
export function useHasDetails(documentType: string): boolean {
  const schema = useSchema()
  const {fields} = useWritingKind(documentType)
  return useMemo(() => hasDetails(schema.get(documentType), fields), [schema, documentType, fields])
}

/** Default first. */
export function useWritingTypes(): string[] {
  const {types} = useWritingRoomConfig()
  return useMemo(() => types.map((option) => option.type), [types])
}
