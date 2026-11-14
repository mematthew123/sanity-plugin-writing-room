import {useMemo} from 'react'
import {
  type AssetFromSource,
  type AssetSource,
  type ImageSchemaType,
  isImageSchemaType,
  useSchema,
  useSource,
} from 'sanity'

/** How this body's images can arrive: what the Studio and the image type allow between them. */
export interface BodyImages {
  /** From the Writer's device: the Insert Menu, a paste or a drop. */
  upload: boolean
  /** The image sources to choose an existing image from. */
  sources: AssetSource[]
  type?: ImageSchemaType
}

export const UPLOAD_ONLY: BodyImages = {upload: true, sources: []}

/** A field's `options.sources` replaces the Studio's list: sources, names of configured ones, or a filter. */
export function resolveImageSources(
  configured: AssetSource[],
  fromType: NonNullable<ImageSchemaType['options']>['sources'],
): AssetSource[] {
  if (!fromType) return configured
  if (typeof fromType === 'function') return configured.filter((source) => fromType(source))
  return fromType.flatMap((entry) => {
    if (typeof entry !== 'string') return [entry]
    const named = configured.find((source) => source.name === entry)
    return named ? [named] : []
  })
}

export function bodyImages(
  form: {image?: {assetSources?: unknown; directUploads?: boolean}} | undefined,
  type: ImageSchemaType | undefined,
): BodyImages {
  // The resolved list is `@beta`. Without it the room still uploads.
  const configured = Array.isArray(form?.image?.assetSources)
    ? (form.image.assetSources as AssetSource[]).filter((source) => !!source?.component)
    : []
  return {
    upload: form?.image?.directUploads !== false && !type?.options?.disableNew,
    sources: resolveImageSources(configured, type?.options?.sources),
    type,
  }
}

/** Must sit inside the Studio. */
export function useBodyImages(documentType: string, bodyField: string): BodyImages {
  const source = useSource()
  const schema = useSchema()
  const form = source.form as Parameters<typeof bodyImages>[0]
  return useMemo(() => {
    const documentSchema = schema.get(documentType)
    const body =
      documentSchema && 'fields' in documentSchema
        ? documentSchema.fields.find((candidate) => candidate.name === bodyField)?.type
        : undefined
    const members = body && 'of' in body && Array.isArray(body.of) ? body.of : []
    const type = members.find(
      (member): member is ImageSchemaType => member.name === 'image' && isImageSchemaType(member),
    )
    return bodyImages(form, type)
  }, [schema, form, documentType, bodyField])
}

/** What a source's selection becomes: a block to insert as it is, or a file to upload first. */
export type ChosenImage =
  | {kind: 'block'; props: Record<string, unknown>}
  | {kind: 'file'; file: () => Promise<File>; options: Record<string, unknown>}

/** The Studio does this in its own image input, which the room can't reach. */
export function chosenImage(chosen: AssetFromSource): ChosenImage {
  if (chosen.kind === 'assetDocumentId') {
    if (typeof chosen.value !== 'string') throw new Error('An image source returned no asset id.')
    const library = chosen.mediaLibraryProps
    return {
      kind: 'block',
      props: {
        asset: {_type: 'reference', _ref: chosen.value},
        ...(library && {
          media: {
            _type: 'globalDocumentReference',
            _ref: `media-library:${library.mediaLibraryId}:${library.assetId}`,
            _weak: true,
          },
        }),
      },
    }
  }

  const {originalFilename, label, title, description, creditLine, source} = chosen.assetDocumentProps ?? {}
  const options = Object.fromEntries(
    Object.entries({filename: originalFilename, label, title, description, creditLine, source}).filter(
      ([, value]) => value != null && value !== '',
    ),
  )
  const {value} = chosen
  if (chosen.kind === 'file') {
    if (!(value instanceof File)) throw new Error('An image source returned no file.')
    return {kind: 'file', file: () => Promise.resolve(value), options: {filename: value.name, ...options}}
  }
  // A URL, or base64 as a data URL: both can be fetched.
  if (typeof value !== 'string') throw new Error('An image source returned no address.')
  return {
    kind: 'file',
    file: async () => {
      const response = await fetch(value)
      if (!response.ok) throw new Error(`Couldn’t fetch the chosen image (${response.status}).`)
      const blob = await response.blob()
      return new File([blob], originalFilename ?? 'image', {type: blob.type})
    },
    options,
  }
}
