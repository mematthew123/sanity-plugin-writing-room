import {type InRelease, type Promised} from './post-status'

export interface ReleaseLike {
  /** As in a copy's id: `versions.<name>.<id>`. */
  name: string
  state: string
  publishAt?: string
  metadata?: {
    title?: string
    releaseType?: string
    cardinality?: string
    intendedPublishAt?: string
  }
}

/** How the platform schedules a single Post. */
export const isOnePostRelease = (release: ReleaseLike) => release.metadata?.cardinality === 'one'

/** Held is the Studio's "paused": off the schedule, with its time remembered. */
export function promiseOf(release: ReleaseLike | null | undefined): Promised | null {
  if (!release || !isOnePostRelease(release)) return null
  const at = release.publishAt ?? release.metadata?.intendedPublishAt
  if (!at) return null
  if (release.state === 'scheduled' || release.state === 'scheduling') return {at, held: false}
  if (release.state === 'active' && release.metadata?.releaseType === 'scheduled') return {at, held: true}
  return null
}

export function describeRelease(release: ReleaseLike): InRelease {
  const scheduled = release.state === 'scheduled' || release.state === 'scheduling'
  const scheduledFor = scheduled ? (release.publishAt ?? release.metadata?.intendedPublishAt) : undefined
  return {title: release.metadata?.title?.trim() || 'an untitled release', ...(scheduledFor && {scheduledFor})}
}

/** Null for a draft or a published document. */
export function releaseOfCopy(copyId: string): string | null {
  return /^versions\.([^.]+)\./.exec(copyId)?.[1] ?? null
}

/** Should a Post have two promises: the scheduled one, then the nearer time, then by id so order never decides. */
function comesBefore(a: Promised, aRelease: string, b: Promised, bRelease: string): boolean {
  if (a.held !== b.held) return !a.held
  const [aTime, bTime] = [new Date(a.at).getTime(), new Date(b.at).getTime()]
  return aTime !== bTime ? aTime < bTime : aRelease < bRelease
}

export function findPromise(
  releases: readonly ReleaseLike[],
  copyIds: readonly string[],
): {release: ReleaseLike; promise: Promised} | null {
  const mine = new Set(copyIds.map(releaseOfCopy))
  let found: {release: ReleaseLike; promise: Promised} | null = null
  for (const release of releases) {
    const promise = mine.has(release.name) ? promiseOf(release) : null
    if (promise && (!found || comesBefore(promise, release.name, found.promise, found.release.name))) {
      found = {release, promise}
    }
  }
  return found
}

export interface PromisedPost {
  documentId: string
  documentType: string
  releaseId: string
  promise: Promised
  editedAt?: string
}

/** Most recently edited first. A Scheduled Post may have no draft, so this is the only list it is on. */
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
    if (known && !comesBefore(promise, releaseId, known.promise, known.releaseId)) continue
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

/** Whether two copies say the same thing, whatever their ids, revisions and dates. */
export function sameWords(
  a: Record<string, unknown> | null | undefined,
  b: Record<string, unknown> | null | undefined,
): boolean {
  if (!a || !b) return false
  return a._type === b._type && isSame(words(a), words(b))
}
