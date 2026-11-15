/** The parts of a Sanity release document the room reads. */
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

/**
 * Where a document stands with Sanity's Scheduled Drafts. See CONTEXT.md, Scheduling.
 *
 * - `scheduled`: its Scheduled version will go live at `publishAt`.
 * - `settling`: a release is on its way into or out of being scheduled. Locked, nothing to do yet.
 * - `stale`: a Scheduled version is left over and nothing will go live.
 */
export type Schedule =
  | {kind: 'none'}
  | {kind: 'scheduled'; releaseId: string; publishAt: string}
  | {kind: 'settling'; releaseId: string}
  | {kind: 'stale'; releaseId: string; intendedPublishAt?: string}

export const NOT_SCHEDULED: Schedule = {kind: 'none'}

/**
 * A release is unscheduled for a moment while it is being made, and again while it is being taken
 * apart. Only one that stays that way is a Stale version.
 */
export const STALE_AFTER_MS = 60_000

const RELEASE_ID_PREFIX = '_.releases.'

export const releaseIdOf = (release: Pick<ScheduleRelease, '_id'>): string =>
  release._id.startsWith(RELEASE_ID_PREFIX) ? release._id.slice(RELEASE_ID_PREFIX.length) : release._id

export const versionIdOf = (documentId: string, releaseId: string): string =>
  `versions.${releaseId}.${documentId}`

export const draftIdOf = (documentId: string): string => `drafts.${documentId}`

const RANK: Record<Schedule['kind'], number> = {scheduled: 3, settling: 2, stale: 1, none: 0}

function scheduleOf(release: ScheduleRelease, now: number): Schedule {
  const releaseId = releaseIdOf(release)
  const publishAt = release.publishAt ?? release.metadata.intendedPublishAt
  switch (release.state) {
    case 'scheduled':
      return publishAt ? {kind: 'scheduled', releaseId, publishAt} : {kind: 'settling', releaseId}
    case 'scheduling':
    case 'unscheduling':
    case 'publishing':
    case 'archiving':
      return {kind: 'settling', releaseId}
    case 'active': {
      const updated = release._updatedAt ? new Date(release._updatedAt).getTime() : 0
      return now - updated < STALE_AFTER_MS
        ? {kind: 'settling', releaseId}
        : {kind: 'stale', releaseId, intendedPublishAt: release.metadata.intendedPublishAt}
    }
    default:
      return NOT_SCHEDULED
  }
}

/**
 * Reads a document's schedule from its version ids and the Studio's releases. Only single-document
 * releases count: a document in a larger Content Release is Studio's to look after.
 */
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

/** How long until a `settling` release would count as stale, so the room can look again then. */
export function settlesIn(release: ScheduleRelease, now: number = Date.now()): number | null {
  if (release.state !== 'active' || !release._updatedAt) return null
  const left = STALE_AFTER_MS - (now - new Date(release._updatedAt).getTime())
  return left > 0 ? left : null
}

/**
 * Whether a published date is one the room stamped for this schedule, rather than one the Writer
 * set: it is the very moment the document was scheduled for.
 */
export function isRoomStampedDate(publishedAt: unknown, scheduledFor: string | undefined): boolean {
  if (typeof publishedAt !== 'string' || !scheduledFor) return false
  const stamped = new Date(publishedAt).getTime()
  return !Number.isNaN(stamped) && stamped === new Date(scheduledFor).getTime()
}

const NOT_CONTENT = ['_rev', '_updatedAt', '_createdAt', '_system']

/**
 * The draft that Unlock leaves the Writer with: the Scheduled version's content, without a
 * published date the room stamped for the schedule now being taken away.
 */
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

/** `YYYY-MM-DDTHH:mm` in the Writer's own time zone: what a `datetime-local` input reads and writes. */
export function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** The time a `datetime-local` input holds, or null when it's empty or not a time. */
export function fromLocalInput(value: string): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * What the schedule panel opens on: the time the document was last scheduled for when that's
 * still ahead, otherwise nine tomorrow morning.
 */
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

/**
 * A go-live time in the Writer's words: "Friday 21 November at 09:00". `short` is for the Lobby's
 * one line: the weekday alone when it's within the week.
 */
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
