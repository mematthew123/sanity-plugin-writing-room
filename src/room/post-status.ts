/** The App SDK's `_status` for a document: when its draft and published versions were last edited. */
export interface DocumentEditStatus {
  lastEditedDraftAt?: string
  lastEditedPublishedAt?: string
}

export interface PostStatus {
  label: 'Draft' | 'Published' | 'Published · unpublished changes'
  lastEditedAt: string | undefined
}

/** Describes a Post's state in the Writer's words (see Q16 in the design session). */
export function describePostStatus(status: DocumentEditStatus | undefined): PostStatus {
  const draft = status?.lastEditedDraftAt
  const published = status?.lastEditedPublishedAt

  if (!published) return {label: 'Draft', lastEditedAt: draft}
  if (!draft) return {label: 'Published', lastEditedAt: published}
  return {
    label: 'Published · unpublished changes',
    lastEditedAt: draft > published ? draft : published,
  }
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

/** "just now", "5 minutes ago", "yesterday", "3 weeks ago"… */
export function timeAgo(date: string, now: Date = new Date()): string {
  const seconds = Math.max(0, (now.getTime() - new Date(date).getTime()) / 1000)
  for (const [unit, size] of UNITS) {
    if (seconds >= size) return relative.format(-Math.floor(seconds / size), unit)
  }
  return 'just now'
}
