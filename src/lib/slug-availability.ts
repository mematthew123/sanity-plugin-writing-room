import {type SanityClient} from 'sanity'

/** Whether another Post (any version of it) already uses `slug`. */
export function slugTakenByAnotherPost(client: SanityClient, postId: string) {
  return (slug: string) =>
    client.fetch<boolean>(
      `count(*[_type == "post" && slug.current == $slug && !(_id in [$id, "drafts." + $id])]) > 0`,
      {slug, id: postId},
    )
}
