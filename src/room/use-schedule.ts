import {type DocumentHandle} from '@sanity/sdk-react'
import {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react'
import {
  useActiveReleases,
  useDocumentVersions,
  useFeatureEnabled,
  useScheduledDraftsEnabled,
} from 'sanity'
import {
  changedAtLocally,
  NOT_SCHEDULED,
  type Schedule,
  scheduleFor,
  type ScheduleRelease,
  settlesIn,
  sightingOf,
} from '../lib/schedule'

const NOTHING_SEEN: ReadonlyMap<string, number> = new Map()

/**
 * Whether the room offers Schedule. It follows Studio: scheduled drafts are on unless the Studio's
 * config turns them off, and the project's plan has to include them.
 */
export function useSchedulingEnabled(): boolean {
  const configured = useScheduledDraftsEnabled()
  const plan = useFeatureEnabled('singleDocRelease')
  return configured && plan.enabled
}

/**
 * A document's schedule, kept up to date. It is read whether or not scheduling is on, so a
 * document that is already Scheduled stays locked, and can be unlocked, either way.
 *
 * Null until the releases and the document's versions have first been read: before then a
 * Scheduled document looks like any draft, and must not be offered as one.
 */
export function useSchedule(documentId: string): Schedule | null {
  const {data: releases, loading: releasesLoading, error: releasesError} = useActiveReleases()
  const {data: versionIds, loading: versionsLoading, error: versionsError} = useDocumentVersions({documentId})
  const [now, setNow] = useState(() => Date.now())

  // A store that failed has nothing more to say; the room opens on what there is. And once known,
  // always known: a store that reads again later must not shut a room someone is writing in.
  const loading = (releasesLoading && !releasesError) || (versionsLoading && !versionsError)
  const [knownFor, setKnownFor] = useState<string | null>(null)
  if (!loading && knownFor !== documentId) setKnownFor(documentId)
  const known = !loading || knownFor === documentId

  const mine = useMemo(
    () =>
      (releases as ScheduleRelease[]).filter(
        (release) => scheduleFor(documentId, versionIds, [release], Infinity).kind !== 'none',
      ),
    [releases, versionIds, documentId],
  )

  // When each of them last changed, by this browser's clock rather than Sanity's: see
  // `changedAtLocally`. Noted before the browser paints, so a release is never shown untimed.
  const [seen, setSeen] = useState(NOTHING_SEEN)
  const watching = useRef<string | null>(null)
  useLayoutEffect(() => {
    if (!known) return
    const arrived = watching.current === documentId
    watching.current = documentId
    setSeen((before) => {
      const seenAt = Date.now()
      const after = new Map<string, number>()
      let changed = before.size !== mine.length
      for (const release of mine) {
        const sighting = sightingOf(release)
        const at = before.get(sighting)
        if (at === undefined) changed = true
        after.set(sighting, at ?? changedAtLocally(release, {seenAt, arrived}))
      }
      return changed ? after : before
    })
  }, [mine, known, documentId])

  const timed = useMemo(
    () =>
      mine.map((release) => ({
        ...release,
        _updatedAt: new Date(seen.get(sightingOf(release)) ?? now).toISOString(),
      })),
    [mine, seen, now],
  )

  // A release that has just become unscheduled is looked at again once it would count as stale.
  useEffect(() => {
    const waits = timed.map((release) => settlesIn(release)).filter((wait): wait is number => wait !== null)
    if (waits.length === 0) return undefined
    const timer = setTimeout(() => setNow(Date.now()), Math.min(...waits) + 50)
    return () => clearTimeout(timer)
  }, [timed, now])

  return useMemo(() => {
    if (!known) return null
    if (timed.length === 0) return NOT_SCHEDULED
    return scheduleFor(documentId, versionIds, timed, Math.max(now, Date.now()))
  }, [known, timed, versionIds, documentId, now])
}

/** The handle for what the room shows: the Scheduled version while there is one, otherwise the draft. */
export function useShownHandle(handle: DocumentHandle, schedule: Schedule): DocumentHandle {
  const releaseId = schedule.kind === 'none' ? undefined : schedule.releaseId
  return useMemo(
    () => (releaseId ? {...handle, perspective: {releaseName: releaseId}} : handle),
    [handle, releaseId],
  )
}
