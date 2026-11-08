import {sanitySchemaToPortableTextSchema} from '@portabletext/sanity-bridge'
import {useMemo} from 'react'
import {type ArraySchemaType, useSchema} from 'sanity'

/** The editor's schema, derived from the Studio's `body` type so the two can never drift apart. */
export function useBodySchema() {
  const schema = useSchema()
  return useMemo(() => {
    const body = schema.get('body')
    if (!body) throw new Error('The `body` schema type is missing.')
    return sanitySchemaToPortableTextSchema(body as ArraySchemaType<unknown>)
  }, [schema])
}
