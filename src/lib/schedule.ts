export interface ScheduleRelease {
  _id: string
  state: string
  _updatedAt?: string
  publishAt?: string
  metadata: {
    releaseType?: string
    cardinality?: string
    intendedPublishAt?: string
  }
}

export type Schedule =
  | {kind: 'none'}
  | {kind: 'scheduled'; releaseId: string; publishAt: string}
  | {kind: 'settling'; releaseId: string}
  | {kind: 'stale'; releaseId: string; intendedPublishAt?: string}

export const NOT_SCHEDULED: Schedule = {kind: 'none'}

export const STALE_AFTER_MS = 60_000

const RELEASE_ID_PREFIX = '_.releases.'

export const releaseIdOf = (release: Pick<ScheduleRelease, '_id'>): string =>
  release._id.startsWith(RELEASE_ID_PREFIX) ? release._id.slice(RELEASE_ID_PREFIX.length) : release._id

export const versionIdOf = (documentId: string, releaseId: string): string =>
  `versions.${releaseId}.${documentId}`

export const draftIdOf = (documentId: string): string => `drafts.${documentId}`

const RANK: Record<Schedule['kind'], number> = {scheduled: 3, settling: 2, stale: 1, none: 0}

const IN_BETWEEN = ['scheduling', 'unscheduling', 'publishing', 'archiving']

function staleAt(release: ScheduleRelease): number | null {
  const {state} = release
  const scheduled = state === 'scheduled' && !!(release.publishAt ?? release.metadata.intendedPublishAt)
  if (scheduled || (state !== 'scheduled' && state !== 'active' && !IN_BETWEEN.includes(state))) return null
  const updated = release._updatedAt ? new Date(release._updatedAt).getTime() : 0
  return (Number.isNaN(updated) ? 0 : updated) + STALE_AFTER_MS
}

function scheduleOf(release: ScheduleRelease, now: number): Schedule {
  const releaseId = releaseIdOf(release)
  const publishAt = release.publishAt ?? release.metadata.intendedPublishAt
  if (release.state === 'scheduled' && publishAt) return {kind: 'scheduled', releaseId, publishAt}
  const stale = staleAt(release)
  if (stale === null) return NOT_SCHEDULED
  return now < stale
    ? {kind: 'settling', releaseId}
    : {kind: 'stale', releaseId, intendedPublishAt: release.metadata.intendedPublishAt}
}

export function scheduleFor(
  documentId: string,
  versionIds: readonly string[],
  releases: readonly ScheduleRelease[],
  now: number = Date.now(),
): Schedule {
  let found: Schedule = NOT_SCHEDULED
  for (const release of releases) {
    if (release.metadata.cardinality !== 'one') continue
    if (!versionIds.includes(versionIdOf(documentId, releaseIdOf(release)))) continue
    const schedule = scheduleOf(release, now)
    if (RANK[schedule.kind] > RANK[found.kind]) found = schedule
  }
  return found
}

export function settlesIn(release: ScheduleRelease, now: number = Date.now()): number | null {
  const stale = staleAt(release)
  return stale !== null && stale > now ? stale - now : null
}

export const sightingOf = (release: ScheduleRelease): string =>
  `${release._id} ${release.state} ${release._updatedAt ?? ''}`

export function changedAtLocally(
  release: ScheduleRelease,
  {seenAt, arrived}: {seenAt: number; arrived: boolean},
): number {
  if (arrived) return seenAt
  const updated = release._updatedAt ? new Date(release._updatedAt).getTime() : 0
  return Math.min(seenAt, Number.isNaN(updated) ? 0 : updated)
}

export function isRoomStampedDate(publishedAt: unknown, scheduledFor: string | undefined): boolean {
  if (typeof publishedAt !== 'string' || !scheduledFor) return false
  const stamped = new Date(publishedAt).getTime()
  return !Number.isNaN(stamped) && stamped === new Date(scheduledFor).getTime()
}

const NOT_CONTENT = ['_rev', '_updatedAt', '_createdAt', '_system']

export function draftFromScheduledVersion(
  version: Record<string, unknown>,
  {
    documentId,
    dateField,
    scheduledFor,
  }: {documentId: string; dateField?: string; scheduledFor?: string},
): Record<string, unknown> & {_id: string} {
  const draft: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(version)) {
    if (!NOT_CONTENT.includes(key)) draft[key] = value
  }
  if (dateField && isRoomStampedDate(draft[dateField], scheduledFor)) delete draft[dateField]
  return {...draft, _id: draftIdOf(documentId)}
}

export function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function fromLocalInput(value: string): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function suggestedTime(previous: string | undefined, now: Date = new Date()): Date {
  if (previous) {
    const before = new Date(previous)
    if (before.getTime() > now.getTime()) return before
  }
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(9, 0, 0, 0)
  return tomorrow
}

const DAY_MS = 24 * 3600 * 1000

export function formatGoLive(
  publishAt: string,
  {
    now = new Date(),
    short = false,
    locale = 'en-GB',
    timeZone,
  }: {now?: Date; short?: boolean; locale?: string; timeZone?: string} = {},
): string {
  const date = new Date(publishAt)
  const time = new Intl.DateTimeFormat(locale, {hour: '2-digit', minute: '2-digit', hour12: false, timeZone}).format(date)
  const ahead = date.getTime() - now.getTime()
  const year = (d: Date) => new Intl.DateTimeFormat(locale, {year: 'numeric', timeZone}).format(d)
  const day = new Intl.DateTimeFormat(locale, {
    weekday: short ? undefined : 'long',
    day: 'numeric',
    month: 'long',
    year: year(date) === year(now) ? undefined : 'numeric',
    timeZone,
  }).format(date)
  if (short && ahead >= 0 && ahead < 6 * DAY_MS) {
    return `${new Intl.DateTimeFormat(locale, {weekday: 'long', timeZone}).format(date)} at ${time}`
  }
  return `${day.replace(',', '')} at ${time}`
}
