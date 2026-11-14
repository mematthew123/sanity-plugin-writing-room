import {type DocumentHandle, useActiveReleases, useQuery} from '@sanity/sdk-react'
import {createContext, type ReactNode, useContext, useEffect, useMemo, useState} from 'react'
import {type SanityClient, useClient, useSchema, useSource} from 'sanity'
import {API_VERSION} from '../lib/api-version'
import {type Promised} from './post-status'
import {findPromise, type ReleaseLike} from './promised'
import {copyId, draftId, foldBack, type ScheduleClient, tidyDraft} from './schedule'
import {isAhead} from '../lib/promised-time'

/** The Studio's client, as the few writes scheduling is made of. */
export function scheduleClient(client: SanityClient): ScheduleClient {
  return {
    read: (id) => client.getDocument(id),
    setFields: (id, fields, {ifRevision, unset = []} = {}) => {
      let patch = client.patch(id).set(fields)
      if (unset.length > 0) patch = patch.unset(unset)
      if (ifRevision) patch = patch.ifRevisionId(ifRevision)
      return patch.commit()
    },
    createCopy: ({document, publishedId, releaseId}) =>
      client.createVersion({
        document: document as {_id: string; _type: string},
        publishedId,
        ...(releaseId && {releaseId}),
      }),
    discardCopy: ({publishedId, releaseId}) => client.discardVersion({publishedId, ...(releaseId && {releaseId})}),
    createRelease: ({releaseId, title, at}) =>
      client.releases.create({
        releaseId,
        metadata: {title, description: '', releaseType: 'scheduled', cardinality: 'one', intendedPublishAt: at},
      }),
    setReleaseTime: ({releaseId, at}) =>
      client.releases.edit({releaseId, patch: {set: {'metadata.intendedPublishAt': at}}}),
    schedule: ({releaseId, at}) => client.releases.schedule({releaseId, publishAt: at}),
    unschedule: ({releaseId}) => client.releases.unschedule({releaseId}),
    publish: ({releaseId}) => client.releases.publish({releaseId}),
    removeRelease: async ({releaseId}) => {
      await client.releases.archive({releaseId})
      await client.releases.delete({releaseId})
    },
  }
}

const MAX_TIMER_MS = 2 ** 31 - 1

/** Which copy of a Post the room has open, and what is promised for it. */
export interface PostCopy {
  documentId: string
  documentType: string
  /** The Post's one-Post release, while it is Scheduled or taken off the schedule. */
  releaseId: string | null
  promise: Promised | null
  /** The id of the copy that is open: the Scheduled copy, or the draft. */
  openId: string
  /** For the App SDK: the same document, read and written through its release when it has one. */
  handle: DocumentHandle
  /** A draft with other words sits beside the Scheduled copy. They are someone's, so the room leaves them. */
  otherChanges: boolean
}

const Copy = createContext<PostCopy | null>(null)

export function usePostCopy(): PostCopy {
  const copy = useContext(Copy)
  if (!copy) throw new Error('usePostCopy must be used inside the room')
  return copy
}

/** A promise the room has just made, held until the Studio's own list of releases catches up. */
export interface JustPromised {
  releaseId: string
  promise: Promised
}

/**
 * Finds the Post's schedule, if it has one, and keeps the room's promise that it leaves nothing
 * behind (ADR-0004): a leftover draft that matches the Scheduled copy is removed, and a Post taken
 * off the schedule whose time has gone by is folded back into an ordinary draft.
 */
export function PostCopyProvider({
  documentId,
  documentType,
  justPromised,
  onCaughtUp,
  children,
}: {
  documentId: string
  documentType: string
  justPromised: JustPromised | null
  /** The Studio's list now has the promise, so the room's own note of it can go. */
  onCaughtUp: () => void
  children: (copy: PostCopy) => ReactNode
}) {
  const client = useClient({apiVersion: API_VERSION})
  const releases = useActiveReleases() as unknown as ReleaseLike[]
  const {data: copyIds} = useQuery<string[]>({
    query: '*[sanity::versionOf($id)]._id',
    params: {id: documentId},
    perspective: 'raw',
  })
  const found = useMemo(() => findPromise(releases, copyIds ?? []), [releases, copyIds])
  const releaseId = found?.release.name ?? justPromised?.releaseId ?? null
  const promise = found?.promise ?? justPromised?.promise ?? null
  const hasDraft = (copyIds ?? []).includes(draftId(documentId))
  const [otherChanges, setOtherChanges] = useState(false)

  const caughtUp = !!found && !!justPromised
  useEffect(() => {
    if (caughtUp) onCaughtUp()
  }, [caughtUp, onCaughtUp])

  // Only what is settled on the server is tidied: never a promise the room is still making.
  const settled = found ? found.release.name : null
  const heldUntil = found?.promise.held ? found.promise.at : null
  const expired = !!heldUntil && !isAhead(heldUntil)
  // The time can go by while the room is open: look again when it does, so the fold-back runs.
  const [looked, lookAgain] = useState(0)
  useEffect(() => {
    if (!heldUntil) return undefined
    const wait = new Date(heldUntil).getTime() - Date.now()
    if (!(wait >= 0)) return undefined
    // A timer can't wait longer than this, so a far-off time is waited for in turns.
    const timer = setTimeout(() => lookAgain((count) => count + 1), Math.min(wait + 1, MAX_TIMER_MS))
    return () => clearTimeout(timer)
  }, [heldUntil, looked])
  useEffect(() => {
    if (!settled) {
      setOtherChanges(false)
      return undefined
    }
    let stale = false
    const tidy = scheduleClient(client)
    const target = {documentId, releaseId: settled}
    const work = expired
      ? foldBack(tidy, target).then((result) => result === 'kept')
      : hasDraft
        ? tidyDraft(tidy, target).then((result) => result === 'differs')
        : Promise.resolve(false)
    work.then(
      (differs) => {
        if (!stale) setOtherChanges(differs)
      },
      // Tidying is a courtesy. If it can't be done just now, the next visit tries again.
      () => undefined,
    )
    return () => {
      stale = true
    }
  }, [client, documentId, settled, expired, hasDraft])

  const copy = useMemo<PostCopy>(
    () => ({
      documentId,
      documentType,
      releaseId,
      promise,
      openId: releaseId ? copyId(documentId, releaseId) : draftId(documentId),
      handle: releaseId
        ? {documentId, documentType, perspective: {releaseName: releaseId}}
        : {documentId, documentType},
      otherChanges,
    }),
    [documentId, documentType, releaseId, promise, otherChanges],
  )

  return <Copy.Provider value={copy}>{children(copy)}</Copy.Provider>
}

/**
 * Whether "Choose a time" can work here. The Studio can turn scheduling off for the workspace, or
 * take its own "Schedule publish" away from a type or a role; the room follows both. If neither
 * can be read, scheduling is absent (ADR-0003).
 */
export function useCanSchedule(documentId: string, documentType: string): boolean {
  const source = useSource()
  const schema = useSchema()
  return useMemo(() => {
    try {
      const enabled = (source as {scheduledDrafts?: {enabled?: boolean}}).scheduledDrafts?.enabled
      if (!enabled || !schema.get(documentType)) return false
      const actions = source.document.actions({
        schemaType: documentType,
        documentId,
        versionType: 'draft',
        releaseId: undefined,
      })
      return actions.some((action) => action.displayName === 'SchedulePublishAction')
    } catch {
      return false
    }
  }, [source, schema, documentId, documentType])
}
