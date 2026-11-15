import {type DocumentHandle} from '@sanity/sdk-react'
import {useEffect, useMemo, useState} from 'react'
import {
  useActiveReleases,
  useDocumentVersions,
  useFeatureEnabled,
  useScheduledDraftsEnabled,
} from 'sanity'
import {NOT_SCHEDULED, type Schedule, scheduleFor, type ScheduleRelease, settlesIn} from '../lib/schedule'

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
 */
export function useSchedule(documentId: string): Schedule {
  const {data: releases} = useActiveReleases()
  const {data: versionIds} = useDocumentVersions({documentId})
  const [now, setNow] = useState(() => Date.now())

  const mine = useMemo(
    () =>
      (releases as ScheduleRelease[]).filter(
        (release) => scheduleFor(documentId, versionIds, [release], Infinity).kind !== 'none',
      ),
    [releases, versionIds, documentId],
  )

  // A release that has just become unscheduled is looked at again once it would count as stale.
  useEffect(() => {
    const waits = mine.map((release) => settlesIn(release)).filter((wait): wait is number => wait !== null)
    if (waits.length === 0) return undefined
    const timer = setTimeout(() => setNow(Date.now()), Math.min(...waits) + 50)
    return () => clearTimeout(timer)
  }, [mine, now])

  return useMemo(() => {
    if (mine.length === 0) return NOT_SCHEDULED
    return scheduleFor(documentId, versionIds, mine, Math.max(now, Date.now()))
  }, [mine, versionIds, documentId, now])
}

/** The handle for what the room shows: the Scheduled version while there is one, otherwise the draft. */
export function useShownHandle(handle: DocumentHandle, schedule: Schedule): DocumentHandle {
  const releaseId = schedule.kind === 'none' ? undefined : schedule.releaseId
  return useMemo(
    () => (releaseId ? {...handle, perspective: {releaseName: releaseId}} : handle),
    [handle, releaseId],
  )
}
