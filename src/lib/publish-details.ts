import {slugify, uniqueSlug} from './slug'

export interface PublishablePost {
  title?: unknown
  slug?: {current?: string}
  publishedAt?: string
}

/** For titles with no Latin letters or digits, e.g. `静かな朝`. */
const FALLBACK_SLUG = 'post'

export interface PublishDetails {
  slug?: {_type: 'slug'; current: string}
  publishedAt?: string
}

/** Settles a unique slug on the first publish and stamps a missing published date. */
export async function detailsForPublish({
  post,
  isFirstPublish,
  isTaken,
  now = new Date().toISOString(),
}: {
  post: PublishablePost
  isFirstPublish: boolean
  isTaken: (slug: string) => Promise<boolean>
  now?: string
}): Promise<PublishDetails> {
  const details: PublishDetails = {}
  const current = post.slug?.current

  if (!current || isFirstPublish) {
    const base = current || (typeof post.title === 'string' && slugify(post.title)) || FALLBACK_SLUG
    const settled = await uniqueSlug(base, isTaken)
    if (settled !== current) details.slug = {_type: 'slug', current: settled}
  }
  if (!post.publishedAt) details.publishedAt = now
  return details
}
