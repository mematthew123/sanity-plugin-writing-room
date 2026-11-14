import {type DocumentHandle, useActiveReleases, useQuery} from '@sanity/sdk-react'
import {createContext, type ReactNode, useContext, useEffect, useMemo, useState} from 'react'
import {type SanityClient, useClient, useSchema, useSource} from 'sanity'
import {API_VERSION} from '../lib/api-version'
import {type Promised} from './post-status'
import {foldPhase, isFolding} from './fold'
import {findPromise, type ReleaseLike} from './promised'
import {copyId, draftId, foldBack, type ScheduleClient, tidyDraft} from './schedule'
import {isAhead, waitUntil} from '../lib/promised-time'
import {sameMoment} from '../lib/publish-details'
import {useWritingKind} from './kinds'

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
    discardCopy: ({publishedId, releaseId, ifRevision}) =>
      ifRevision && releaseId
        ? deleteAt(client, copyId(publishedId, releaseId), ifRevision)
        : client.discardVersion({publishedId, ...(releaseId && {releaseId})}),
    discardDraft: ({publishedId, ifRevision}) => deleteAt(client, draftId(publishedId), ifRevision),
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

/** The discard actions take no revision. A patch does, and when it fails the delete fails with it. */
const deleteAt = (client: SanityClient, id: string, revision: string) =>
  client
    .transaction()
    .patch(id, (patch) => patch.ifRevisionId(revision).unset([NO_SUCH_FIELD]))
    .delete(id)
    .commit()

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
  /** Its time went by and it is being turned back into a draft: nothing can be typed until it is. */
  folding: boolean
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

interface ScheduleMemory {
  /** The release of a schedule still being made, or one that failed and is being taken away. */
  making: string | null
  justPromised: JustPromised | null
  /** Everything typed in the room has been saved. */
  synced: boolean
  setMaking: (releaseId: string | null) => void
  setJustPromised: (promised: JustPromised | null) => void
  setSynced: (synced: boolean) => void
}

const Memory = createContext<ScheduleMemory | null>(null)

/**
 * What scheduling has to know while the room starts over on another copy. The room is keyed by its
 * copy, so this sits above it.
 */
export function ScheduleMemoryProvider({children}: {children: ReactNode}) {
  const [making, setMaking] = useState<string | null>(null)
  const [justPromised, setJustPromised] = useState<JustPromised | null>(null)
  const [synced, setSynced] = useState(true)
  const memory = useMemo(
    () => ({making, justPromised, synced, setMaking, setJustPromised, setSynced}),
    [making, justPromised, synced],
  )
  return <Memory.Provider value={memory}>{children}</Memory.Provider>
}

export function useScheduleMemory(): ScheduleMemory {
  const memory = useContext(Memory)
  if (!memory) throw new Error('useScheduleMemory must be used inside the room')
  return memory
}

type Found = ReturnType<typeof findPromise>

/** Tidies what a schedule leaves behind: a matching draft, or a promise whose time has gone by. */
function useTidy({
  documentId,
  documentType,
  found,
  hasDraft,
}: {
  documentId: string
  documentType: string
  found: Found
  hasDraft: boolean
}): {otherChanges: boolean; folding: boolean} {
  const client = useClient({apiVersion: API_VERSION})
  const {making, synced} = useScheduleMemory()
  const [otherChanges, setOtherChanges] = useState(false)

  // Never tidy a promise the room is still making: the release shows up here before it is one, and
  // a schedule that fails takes the copy away again.
  const settled = found && found.release.name !== making ? found.release.name : null
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

  const {fields} = useWritingKind(documentType)
  const roomWrites = useMemo(
    () => [fields.slug, fields.publishedAt].filter((field): field is string => !!field),
    [fields.slug, fields.publishedAt],
  )
  const dateField = fields.publishedAt
  const promisedAt = found?.promise.at

  const [held, setHeld] = useState<string | null>(null)
  const [leftAsIs, setLeftAsIs] = useState<string | null>(null)
  const phase = foldPhase({release: settled, expired, synced, held, leftAsIs})
  useEffect(() => {
    if (phase === 'hold') setHeld(settled)
  }, [phase, settled])
  const fold = phase === 'fold'

  useEffect(() => {
    if (!settled) {
      setOtherChanges(false)
      return undefined
    }
    if (expired && !fold) return undefined
    let stale = false
    const tidy = scheduleClient(client)
    const target = {documentId, releaseId: settled, roomWrites}
    if (expired) {
      // The date the room wrote for the promise is no date once the promise is gone.
      const stamped = (copy: Record<string, unknown>) => {
        const date = dateField ? copy[dateField] : undefined
        return dateField && promisedAt && typeof date === 'string' && sameMoment(date, promisedAt) ? [dateField] : []
      }
      foldBack(tidy, {...target, stamped}).then(
        (result) => {
          if (stale) return
          if (result === 'moved') lookAgain((count) => count + 1)
          if (result === 'kept') setLeftAsIs(settled)
          setOtherChanges(result === 'kept')
        },
        // The next visit tries again.
        () => {
          if (!stale) setLeftAsIs(settled)
        },
      )
    } else if (hasDraft) {
      tidyDraft(tidy, target).then(
        (result) => {
          if (!stale) setOtherChanges(result === 'differs')
        },
        // The next visit tries again.
        () => undefined,
      )
    } else {
      setOtherChanges(false)
    }
    return () => {
      stale = true
    }
  }, [client, documentId, settled, expired, fold, hasDraft, looks, roomWrites, dateField, promisedAt])

  return {otherChanges, folding: isFolding(phase)}
}

/** Finds the Post's schedule, and which copy of the Post the room opens. */
export function PostCopyProvider({
  documentId,
  documentType,
  children,
}: {
  documentId: string
  documentType: string
  children: (copy: PostCopy) => ReactNode
}) {
  const {justPromised, setJustPromised} = useScheduleMemory()
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

  const caughtUp = !!found && !!justPromised
  useEffect(() => {
    if (caughtUp) setJustPromised(null)
  }, [caughtUp, setJustPromised])

  const {otherChanges, folding} = useTidy({documentId, documentType, found, hasDraft})

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
      folding,
    }),
    [documentId, documentType, releaseId, promise, otherChanges, folding],
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
