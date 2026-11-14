import {type InRelease, type Promised} from './post-status'

/** As much of a release document as the room reads. */
export interface ReleaseLike {
  /** The release's id, as it appears in a copy's `versions.<name>.<id>`. */
  name: string
  state: string
  /** Set by the platform while the release is scheduled. */
  publishAt?: string
  metadata?: {
    title?: string
    releaseType?: string
    cardinality?: string
    intendedPublishAt?: string
  }
}

/** A release that holds one document: how the platform schedules a single Post. */
export const isOnePostRelease = (release: ReleaseLike) => release.metadata?.cardinality === 'one'

/**
 * What a one-Post release promises. Scheduled, it holds; taken off the schedule (the Studio's
 * "paused") it remembers its time; anything else (published, archived, never given a time) is no
 * promise.
 */
export function promiseOf(release: ReleaseLike | null | undefined): Promised | null {
  if (!release || !isOnePostRelease(release)) return null
  const at = release.publishAt ?? release.metadata?.intendedPublishAt
  if (!at) return null
  if (release.state === 'scheduled' || release.state === 'scheduling') return {at, held: false}
  if (release.state === 'active' && release.metadata?.releaseType === 'scheduled') return {at, held: true}
  return null
}

/** A Release as the room names it. Only for one a person made: a one-Post release has no name to show. */
export function describeRelease(release: ReleaseLike): InRelease {
  const scheduled = release.state === 'scheduled' || release.state === 'scheduling'
  const scheduledFor = scheduled ? (release.publishAt ?? release.metadata?.intendedPublishAt) : undefined
  return {title: release.metadata?.title?.trim() || 'an untitled release', ...(scheduledFor && {scheduledFor})}
}

/** The release a copy belongs to, from its id; null for a draft or a published document. */
export function releaseOfCopy(copyId: string): string | null {
  return /^versions\.([^.]+)\./.exec(copyId)?.[1] ?? null
}

/**
 * The Post's one-Post release among the releases it has copies in. A Post has at most one; if the
 * Studio has somehow left two, the one that is actually scheduled wins, then the nearest time.
 */
export function findPromise(
  releases: readonly ReleaseLike[],
  copyIds: readonly string[],
): {release: ReleaseLike; promise: Promised} | null {
  const mine = new Set(copyIds.map(releaseOfCopy))
  const found = releases.flatMap((release) => {
    const promise = mine.has(release.name) ? promiseOf(release) : null
    return promise ? [{release, promise}] : []
  })
  found.sort((a, b) => Number(a.promise.held) - Number(b.promise.held) || a.promise.at.localeCompare(b.promise.at))
  return found[0] ?? null
}

/** A Post with a promise: Scheduled, or taken off the schedule and waiting to go back on. */
export interface PromisedPost {
  documentId: string
  documentType: string
  releaseId: string
  promise: Promised
  /** When its copy was last edited. */
  editedAt?: string
}

/**
 * Every Post that has a promise, most recently edited first, from the copies that sit in releases.
 * A Scheduled Post may have no draft at all (ADR-0004), so this is the only list it is on.
 */
export function promisedPosts(
  releases: readonly ReleaseLike[],
  copies: ReadonlyArray<{_id: string; _type: string; _updatedAt?: string}>,
): PromisedPost[] {
  const byName = new Map(releases.map((release) => [release.name, release]))
  const posts = new Map<string, PromisedPost>()
  for (const copy of copies) {
    const releaseId = releaseOfCopy(copy._id)
    const promise = releaseId ? promiseOf(byName.get(releaseId)) : null
    if (!releaseId || !promise) continue
    const documentId = copy._id.slice(`versions.${releaseId}.`.length)
    const known = posts.get(documentId)
    // As in `findPromise`: should a Post have two, the one that is really scheduled is its promise.
    if (known && !(known.promise.held && !promise.held)) continue
    posts.set(documentId, {documentId, documentType: copy._type, releaseId, promise, editedAt: copy._updatedAt})
  }
  return [...posts.values()].sort((a, b) => (b.editedAt ?? '').localeCompare(a.editedAt ?? ''))
}

function isSame(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) return false
  return keys.every((key) => key in b && isSame((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]))
}

function words(document: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(document).filter(([key, value]) => !key.startsWith('_') && value !== undefined))
}

/**
 * Whether two copies of a Post say the same thing, whatever their ids, revisions and dates. A draft
 * that says what the Scheduled copy says has nothing to lose, so the room may tidy it away.
 */
export function sameWords(
  a: Record<string, unknown> | null | undefined,
  b: Record<string, unknown> | null | undefined,
): boolean {
  if (!a || !b) return false
  return a._type === b._type && isSame(words(a), words(b))
}
