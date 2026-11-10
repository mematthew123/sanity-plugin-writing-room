import {type SanityClient} from 'sanity'

/** `slugField` comes from the schema, so it's safe to interpolate into the query. */
export function slugTakenByAnother(
  client: SanityClient,
  documentType: string,
  slugField: string | undefined,
  documentId: string,
): (slug: string) => Promise<boolean> {
  if (!slugField) return () => Promise.resolve(false)
  return (slug: string) =>
    client.fetch<boolean>(
      `count(*[_type == $type && ${slugField}.current == $slug && !(_id in [$id, "drafts." + $id])]) > 0`,
      {slug, type: documentType, id: documentId},
    )
}
