import {type SanityClient} from 'sanity'

/**
 * Whether another document of the same type (any version of it) already uses `slug` in its
 * `slugField`. Field names come from the schema, so they're safe to put in the query.
 */
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
