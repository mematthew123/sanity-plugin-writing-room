const MAX_LENGTH = 96

export function slugify(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  if (slug.length <= MAX_LENGTH) return slug
  const cut = slug.slice(0, MAX_LENGTH + 1)
  return cut.slice(0, cut.lastIndexOf('-')).replace(/-+$/, '')
}

export async function uniqueSlug(
  base: string,
  isTaken: (slug: string) => Promise<boolean>,
): Promise<string> {
  let candidate = base
  for (let n = 2; await isTaken(candidate); n++) candidate = `${base}-${n}`
  return candidate
}

/**
 * The slug to set as the title changes, or undefined once the Writer has set it by hand.
 * Only for unpublished documents: after the first publish the slug stays put.
 */
export function followingSlug({
  previousTitle,
  nextTitle,
  currentSlug,
}: {
  previousTitle: string
  nextTitle: string
  currentSlug: string | undefined
}): string | undefined {
  const isFollowing = !currentSlug || currentSlug === slugify(previousTitle)
  return isFollowing ? slugify(nextTitle) : undefined
}
