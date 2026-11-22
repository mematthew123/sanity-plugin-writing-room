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

export function useSchedulingEnabled(): boolean {
  const configured = useScheduledDraftsEnabled()
  const plan = useFeatureEnabled('singleDocRelease')
  return configured && plan.enabled
}

export function useSchedule(documentId: string): Schedule | null {
  const {data: releases, loading: releasesLoading, error: releasesError} = useActiveReleases()
  const {data: versionIds, loading: versionsLoading, error: versionsError} = useDocumentVersions({documentId})
  const [now, setNow] = useState(() => Date.now())

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

export function useShownHandle(handle: DocumentHandle, schedule: Schedule): DocumentHandle {
  const releaseId = schedule.kind === 'none' ? undefined : schedule.releaseId
  return useMemo(
    () => (releaseId ? {...handle, perspective: {releaseName: releaseId}} : handle),
    [handle, releaseId],
  )
}
