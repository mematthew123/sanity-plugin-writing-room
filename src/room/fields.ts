import {
  isArrayOfBlocksSchemaType,
  isImageSchemaType,
  type ObjectField,
  type SchemaType,
} from 'sanity'
import {type PublishablePost, type PublishDetails} from '../lib/publish-details'

/**
 * Where the room finds what it reads and writes in a document type. Only `title` and `body` are
 * required; a type without a slug or a published date still works, the room just doesn't settle
 * what isn't there.
 */
export interface WritingFields {
  /** A string field: the room's title line. */
  title: string
  /** A portable text field: the room's page. */
  body: string
  /** A slug field the room keeps following the title until the first publish, then settles. */
  slug?: string
  /** A datetime field the room stamps on the first publish. */
  publishedAt?: string
  /** An image field outside the body, for the "Add a cover image" nudge after a publish. */
  image?: string
}

/** Whether `type` is, or is built on, the schema type named `name` (e.g. a field of type `slug`). */
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

/** The field the type's preview shows as its title, when that's a plain top-level field. */
function previewTitle(schemaType: SchemaType): string[] {
  const select = (schemaType as {preview?: {select?: Record<string, unknown>}}).preview?.select
  const title = select?.title
  return typeof title === 'string' && !title.includes('.') ? [title] : []
}

/**
 * Finds the room's fields in a document type, so a Studio only has to name the type. Fields the
 * Studio names in `override` win; the rest are detected:
 *
 * - title: `title`, else the field the type's preview uses as its title, else the first string;
 * - body: `body`, else `content`, else the first portable text field;
 * - slug: `slug`, else the first slug field;
 * - published date: `publishedAt`, else the first date field whose name says "publish";
 * - image: `coverImage`, else `mainImage`, else the first image field.
 *
 * Returns the problem instead when the type has no usable title or body.
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

/** The room's view of a document, wherever its type keeps the title, slug and published date. */
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

/** The publish Details as a patch on the type's own fields, leaving out any the type doesn't have. */
export function detailsPatch(details: PublishDetails, fields: WritingFields): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  if (details.slug && fields.slug) patch[fields.slug] = details.slug
  if (details.publishedAt && fields.publishedAt) patch[fields.publishedAt] = details.publishedAt
  return patch
}

/** "Add a cover image", "Add a main image", "Add an image": the nudge after a publish. */
export function addImageLabel(imageTitle = 'Image'): string {
  const name = imageTitle.toLowerCase()
  return `Add ${/^[aeiou]/.test(name) ? 'an' : 'a'} ${name}`
}
