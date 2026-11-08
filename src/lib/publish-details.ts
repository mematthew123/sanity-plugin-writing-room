import {slugify, uniqueSlug} from './slug'

export interface PublishablePost {
  title?: unknown
  slug?: {current?: string}
  publishedAt?: string
}

/** Used when the title can't produce a slug (e.g. `静かな朝`), so every published Post has a URL. */
const FALLBACK_SLUG = 'post'

export interface PublishDetails {
  slug?: {_type: 'slug'; current: string}
  publishedAt?: string
}

/**
 * The Details a Post needs filled in as it's published, so publishing only ever requires Prose.
 * On the first publish the slug is settled
 * (derived from the title if missing, falling back to `post` when the title has no Latin letters
 * or digits, and made unique on a clash) and then stays put; the published date is stamped if empty.
 */
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
