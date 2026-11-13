import {
  isArrayOfBlocksSchemaType,
  isImageSchemaType,
  type ObjectField,
  type SchemaType,
} from 'sanity'
import {type PublishablePost, type PublishDetails} from '../lib/publish-details'

export interface WritingFields {
  title: string
  body: string
  /** Follows the title until the first publish. */
  slug?: string
  /** Stamped on the first publish. */
  publishedAt?: string
  /** For the "Add a cover image" nudge after a publish. */
  image?: string
}

/** Whether `type` is, or is built on, the schema type `name`. */
function isOfType(type: SchemaType | undefined, name: string): boolean {
  for (let current = type; current; current = current.type) {
    if (current.name === name) return true
  }
  return false
}

function find(fields: ObjectField[], test: (field: ObjectField) => boolean, preferred: string[] = []) {
  for (const name of preferred) {
    const field = fields.find((candidate) => candidate.name === name && test(candidate))
    if (field) return field
  }
  return fields.find(test)
}

const isString = (field: ObjectField) => field.type.jsonType === 'string' && isOfType(field.type, 'string')
const isBody = (field: ObjectField) => isArrayOfBlocksSchemaType(field.type)
const isSlug = (field: ObjectField) => isOfType(field.type, 'slug')
const isDate = (field: ObjectField) => isOfType(field.type, 'datetime') || isOfType(field.type, 'date')
const isImage = (field: ObjectField) => isImageSchemaType(field.type)

function previewTitle(schemaType: SchemaType): string[] {
  const select = (schemaType as {preview?: {select?: Record<string, unknown>}}).preview?.select
  const title = select?.title
  return typeof title === 'string' && !title.includes('.') ? [title] : []
}

/**
 * Fields in `override` win; the rest are detected:
 *
 * - title: `title`, else the preview's title field, else the first string;
 * - body: `body`, else `content`, else the first portable text field;
 * - slug: `slug`, else the first slug field;
 * - published date: `publishedAt`, else the first date field whose name says "publish";
 * - image: `coverImage`, else `mainImage`, else the first image field.
 *
 * Returns a problem when the type has no usable title or body.
 */
export function detectFields(
  schemaType: SchemaType,
  override: Partial<WritingFields> = {},
): {fields: WritingFields; imageTitle?: string} | {problem: string} {
  const fields: ObjectField[] = 'fields' in schemaType ? schemaType.fields : []
  const byName = (name: string | undefined) => fields.find((field) => field.name === name)

  for (const [role, name] of Object.entries(override)) {
    if (name !== undefined && !byName(name)) {
      return {problem: `\`fields.${role}\` is "${name}", but "${schemaType.name}" has no field by that name.`}
    }
  }

  const title = override.title ?? find(fields, isString, ['title', ...previewTitle(schemaType)])?.name
  const body = override.body ?? find(fields, isBody, ['body', 'content'])?.name
  if (!title) return {problem: `"${schemaType.name}" has no string field the room can use as its title.`}
  if (!body) return {problem: `"${schemaType.name}" has no portable text field the room can write in.`}

  const slug = override.slug ?? find(fields, isSlug, ['slug'])?.name
  const publishedAt =
    override.publishedAt ??
    find(fields, (field) => isDate(field) && /publish/i.test(field.name), ['publishedAt'])?.name
  const image = override.image ?? find(fields, isImage, ['coverImage', 'mainImage'])?.name

  return {
    fields: {title, body, slug, publishedAt, image},
    imageTitle: byName(image)?.type.title,
  }
}

/** Whether the type has anything for the Details view to show. */
export function hasDetails(schemaType: SchemaType | undefined, {title, body}: Pick<WritingFields, 'title' | 'body'>): boolean {
  const fields: ObjectField[] = schemaType && 'fields' in schemaType ? schemaType.fields : []
  return fields.some((field) => field.name !== title && field.name !== body && field.type.hidden !== true)
}

export function readPublishable(
  document: Record<string, unknown> | null | undefined,
  fields: WritingFields,
): PublishablePost {
  return {
    title: document?.[fields.title],
    slug: fields.slug ? (document?.[fields.slug] as PublishablePost['slug']) : undefined,
    publishedAt: fields.publishedAt ? (document?.[fields.publishedAt] as string | undefined) : undefined,
  }
}

export function detailsPatch(details: PublishDetails, fields: WritingFields): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  if (details.slug && fields.slug) patch[fields.slug] = details.slug
  if (details.publishedAt && fields.publishedAt) patch[fields.publishedAt] = details.publishedAt
  return patch
}

export function addImageLabel(imageTitle = 'Image'): string {
  const name = imageTitle.toLowerCase()
  return `Add ${/^[aeiou]/.test(name) ? 'an' : 'a'} ${name}`
}
