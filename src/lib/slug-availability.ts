import {type SanityClient} from 'sanity'

/** Whether another document of the same type (any version of it) already uses `slug`. */
export function slugTakenByAnother(client: SanityClient, documentType: string, documentId: string) {
  return (slug: string) =>
    client.fetch<boolean>(
      `count(*[_type == $type && slug.current == $slug && !(_id in [$id, "drafts." + $id])]) > 0`,
      {slug, type: documentType, id: documentId},
    )
}
