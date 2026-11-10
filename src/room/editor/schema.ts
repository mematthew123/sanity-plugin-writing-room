import {sanitySchemaToPortableTextSchema} from '@portabletext/sanity-bridge'
import {useMemo} from 'react'
import {type ArraySchemaType, useSchema} from 'sanity'

/**
 * The editor's schema, derived from the document's own body field, so the room can only write
 * what that field allows: a Studio's `blockContent` gets its own styles, lists and blocks.
 */
export function useBodySchema(documentType: string, bodyField: string) {
  const schema = useSchema()
  return useMemo(() => {
    const documentSchema = schema.get(documentType)
    const field =
      documentSchema && 'fields' in documentSchema
        ? documentSchema.fields.find((candidate) => candidate.name === bodyField)
        : undefined
    if (!field) throw new Error(`"${documentType}" has no "${bodyField}" field for the Writing Room to write in.`)
    return sanitySchemaToPortableTextSchema(field.type as ArraySchemaType<unknown>)
  }, [schema, documentType, bodyField])
}
