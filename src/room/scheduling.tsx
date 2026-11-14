import {type DocumentHandle, useActiveReleases, useQuery} from '@sanity/sdk-react'
import {createContext, type ReactNode, useContext, useEffect, useMemo, useState} from 'react'
import {type SanityClient, useClient, useSchema, useSource} from 'sanity'
import {API_VERSION} from '../lib/api-version'
import {type Promised} from './post-status'
import {findPromise, type ReleaseLike} from './promised'
import {copyId, draftId, foldBack, type ScheduleClient, tidyDraft} from './schedule'
import {isAhead, waitUntil} from '../lib/promised-time'

export function scheduleClient(client: SanityClient): ScheduleClient {
  return {
    read: (id) => client.getDocument(id),
    setFields: (id, fields, options) => {
      const set = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined))
      const unset = Object.keys(fields).filter((field) => fields[field] === undefined)
      let patch = client.patch(id)
      if (options?.ifRevision) patch = patch.ifRevisionId(options.ifRevision)
      if (Object.keys(set).length > 0) patch = patch.set(set)
      if (unset.length > 0) patch = patch.unset(unset)
      return patch.commit()
    },
    createCopy: ({document, publishedId, releaseId}) =>
      client.createVersion({
        document: document as {_id: string; _type: string},
        publishedId,
        ...(releaseId && {releaseId}),
      }),
    discardCopy: ({publishedId, releaseId}) => client.discardVersion({publishedId, ...(releaseId && {releaseId})}),
    // The discard action takes no revision. A patch does, and when it fails the delete fails with it.
    discardDraft: ({publishedId, ifRevision}) =>
      client
        .transaction()
        .patch(draftId(publishedId), (patch) => patch.ifRevisionId(ifRevision).unset([NO_SUCH_FIELD]))
        .delete(draftId(publishedId))
        .commit(),
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

/** A patch has to do something to carry a revision condition. */
const NO_SUCH_FIELD = 'writingRoomNoSuchField'

export interface PostCopy {
  documentId: string
  documentType: string
  /** The Post's own release, while it is Scheduled or taken off the schedule. */
  releaseId: string | null
  promise: Promised | null
  openId: string
  /** For the App SDK. */
  handle: DocumentHandle
  /** A draft with other words sits beside the Scheduled copy. */
  otherChanges: boolean
}

const Copy = createContext<PostCopy | null>(null)

export function usePostCopy(): PostCopy {
  const copy = useContext(Copy)
  if (!copy) throw new Error('usePostCopy must be used inside the room')
  return copy
}

/** A promise the room has just made, until the list of releases catches up. */
export interface JustPromised {
  releaseId: string
  promise: Promised
}

/** Finds the Post's schedule, and tidies what a schedule leaves behind: a matching draft, or a promise whose time has gone by. */
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

  // Never tidy a promise the room is still making.
  const settled = found ? found.release.name : null
  // Nothing else changes when a held promise runs out, so look again then.
  const [looks, lookAgain] = useState(0)
  const heldUntil = found?.promise.held ? found.promise.at : undefined
  useEffect(() => {
    // A time further off than a timer can count is reached in steps: each look sets the next.
    const wait = heldUntil ? waitUntil(heldUntil) : null
    if (wait === null) return undefined
    const timer = setTimeout(() => lookAgain((count) => count + 1), wait)
    return () => clearTimeout(timer)
  }, [heldUntil, looks])
  const expired = !!found?.promise.held && !isAhead(found.promise.at)
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
      // The next visit tries again.
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
 * Follows the Studio: scheduling can be off for the workspace, or its "Schedule publish" action
 * removed for a type or a role. If neither can be read, the room doesn't offer it.
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
