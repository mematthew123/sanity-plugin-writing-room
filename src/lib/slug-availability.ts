import {type SanityClient} from 'sanity'

/**
 * Whether another document has the slug. The Post's own copies don't count: its draft, its
 * published document, and its copy in any release, which is where a Scheduled Post keeps its slug.
 *
 * `slugField` comes from the schema, so it's safe to interpolate into the query.
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
      `count(*[_type == $type && ${slugField}.current == $slug && !(_id in [$id, "drafts." + $id]) && !sanity::versionOf($id)]) > 0`,
      {slug, type: documentType, id: documentId},
    )
}
