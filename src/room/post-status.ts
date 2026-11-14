import {type Clock, describePromisedTime, isAhead} from '../lib/promised-time'

/** The App SDK's `_status` for a document. */
export interface DocumentEditStatus {
  lastEditedDraftAt?: string
  lastEditedPublishedAt?: string
  /** The copy in the release the document was read through, if it has one. */
  lastEditedVersionAt?: string
}

/** The time a Post is promised to readers for, or was until the Writer took it off the schedule. */
export interface Promised {
  at: string
  /** Taken off the schedule to be edited. The time is remembered, and nothing goes live. */
  held: boolean
}

/** A Release the open copy belongs to. It goes by its own title. */
export interface InRelease {
  title: string
  /** Set while the Release is scheduled, which locks every copy in it. */
  scheduledFor?: string
}

/** The one thing to do next, which is what the bar's button says. Null when there is nothing. */
export type NextStep = 'publish' | 'publish-changes' | 'schedule-again' | 'scheduled' | null

export interface PostStatus {
  /** In the room's bar: "Published · unpublished changes". */
  label: string
  /** On a Lobby row, which has less room: "Unpublished changes". */
  short: string
  lastEditedAt: string | undefined
  /** Readers have seen this Post, in some form. */
  isPublished: boolean
  /** There is something readers haven't seen yet. */
  unseen: boolean
  next: NextStep
  /** The promised time, while it is Scheduled or waiting to be scheduled again. */
  promisedFor?: string
  /** The words can't change as things stand: the platform locks whatever is scheduled. */
  locked: boolean
}

const latest = (...times: Array<string | undefined>) =>
  times.reduce<string | undefined>((max, time) => (time && (!max || time > max) ? time : max), undefined)

/** Voice per DESIGN.md, Voice & Copy. */
export function describePostStatus(
  status: DocumentEditStatus | undefined,
  {promise, release, ...clock}: {promise?: Promised | null; release?: InRelease | null} & Clock = {},
): PostStatus {
  const draft = status?.lastEditedDraftAt
  const published = status?.lastEditedPublishedAt
  const isPublished = !!published
  const lastEditedAt = latest(draft, published, status?.lastEditedVersionAt)
  const base = {lastEditedAt, isPublished}

  if (release) {
    const when = release.scheduledFor && describePromisedTime(release.scheduledFor, clock)
    const label = when ? `In ${release.title} · scheduled for ${when}` : `In ${release.title}`
    return {...base, label, short: label, unseen: true, next: null, locked: !!release.scheduledFor}
  }

  // A held promise whose time has gone by is no promise at all: the Post is an ordinary Draft again.
  const kept = promise && (!promise.held || isAhead(promise.at, clock.now)) ? promise : null

  if (kept && !kept.held) {
    const when = describePromisedTime(kept.at, clock)
    const scheduled = {...base, unseen: true, next: 'scheduled' as const, promisedFor: kept.at, locked: true}
    return isPublished
      ? {...scheduled, label: `Published · changes scheduled for ${when}`, short: `Changes scheduled for ${when}`}
      : {...scheduled, label: `Scheduled · ${when}`, short: `Scheduled · ${when}`}
  }

  const next: NextStep = kept ? 'schedule-again' : isPublished ? (draft ? 'publish-changes' : null) : 'publish'
  const waiting = {...base, next, locked: false, ...(kept && {promisedFor: kept.at})}

  if (!isPublished) return {...waiting, label: 'Draft', short: 'Draft', unseen: true}
  if (!draft && !kept) return {...waiting, label: 'Published', short: 'Published', unseen: false}
  return {...waiting, label: 'Published · unpublished changes', short: 'Unpublished changes', unseen: true}
}

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
]

const relative = new Intl.RelativeTimeFormat('en', {numeric: 'auto'})

export function timeAgo(date: string, now: Date = new Date()): string {
  const seconds = Math.max(0, (now.getTime() - new Date(date).getTime()) / 1000)
  for (const [unit, size] of UNITS) {
    if (seconds >= size) return relative.format(-Math.floor(seconds / size), unit)
  }
  return 'just now'
}
