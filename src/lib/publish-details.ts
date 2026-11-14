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

const sameMoment = (a: string, b: string) => new Date(a).getTime() === new Date(b).getTime()

/**
 * Settles a unique slug on the first publish and stamps a missing published date.
 *
 * `now` is when readers first see the Post: this moment for a publish, the promised time for a
 * schedule. `promisedBefore` is the time it was last scheduled for, if it was: a date that still
 * equals it is one the room wrote, so it moves to `now`. Any other date is the Writer's, and stays.
 */
export async function detailsForPublish({
  post,
  isFirstPublish,
  isTaken,
  now = new Date().toISOString(),
  promisedBefore,
}: {
  post: PublishablePost
  isFirstPublish: boolean
  isTaken: (slug: string) => Promise<boolean>
  now?: string
  promisedBefore?: string
}): Promise<PublishDetails> {
  const details: PublishDetails = {}
  const current = post.slug?.current

  if (!current || isFirstPublish) {
    const base = current || (typeof post.title === 'string' && slugify(post.title)) || FALLBACK_SLUG
    const settled = await uniqueSlug(base, isTaken)
    if (settled !== current) details.slug = {_type: 'slug', current: settled}
  }
  if (!post.publishedAt) details.publishedAt = now
  else if (promisedBefore && sameMoment(post.publishedAt, promisedBefore) && !sameMoment(post.publishedAt, now)) {
    details.publishedAt = now
  }
  return details
}
