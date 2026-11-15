import {type SanityClient} from 'sanity'
import {draftFromScheduledVersion, draftIdOf, versionIdOf} from './schedule'

const RELEASE_TITLE = 'Scheduled publish'

/** A field no document has. Unsetting it is a patch that changes nothing. */
const CLAIM = 'writingRoomUnlock'

type Stored = Record<string, unknown> & {_id: string; _rev?: string; _updatedAt?: string}

function wasRejected(error: unknown): boolean {
  const status = (error as {statusCode?: unknown} | null)?.statusCode
  return typeof status === 'number' && status >= 400 && status < 500
}

const ARCHIVING_POLL_MS = 250
const ARCHIVING_TIMEOUT_MS = 10_000

/** Archiving settles a moment after Sanity accepts it, and a release can't be deleted until it has. */
async function archived(client: SanityClient, releaseId: string): Promise<void> {
  const giveUpAt = Date.now() + ARCHIVING_TIMEOUT_MS
  try {
    while ((await client.releases.get({releaseId}))?.state === 'archiving' && Date.now() < giveUpAt) {
      await new Promise((resolve) => setTimeout(resolve, ARCHIVING_POLL_MS))
    }
  } catch {
  }
}

async function removeUnscheduled(client: SanityClient, documentId: string, releaseId: string) {
  try {
    await client.discardVersion({releaseId, publishedId: documentId}).catch(() => undefined)
    await client.releases.archive({releaseId})
    await archived(client, releaseId)
    await client.releases.delete({releaseId})
  } catch {
  }
}

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const keys = Object.keys(a)
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => same((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]))
  )
}

async function writeDetails(
  client: SanityClient,
  draftId: string,
  details: Record<string, unknown>,
  revision: string | undefined,
): Promise<{revision: string | undefined; putDetailsBack: () => Promise<void>}> {
  const keys = Object.keys(details)
  if (keys.length === 0) return {revision, putDetailsBack: async () => undefined}
  const before = await client.getDocument<Stored>(draftId)
  const write = client.patch(draftId).set(details)
  const written = await (revision ? write.ifRevisionId(revision) : write).commit<Stored>()
  const putDetailsBack = async () => {
    try {
      // Only what is still as the room wrote it: anything else is someone's newer change.
      const now = await client.getDocument<Stored>(draftId)
      if (!now?._rev) return
      const set: Record<string, unknown> = {}
      const unset: string[] = []
      for (const key of keys) {
        if (!same(now[key], details[key])) continue
        if (before && before[key] !== undefined) set[key] = before[key]
        else unset.push(key)
      }
      if (Object.keys(set).length + unset.length === 0) return
      await client.patch(draftId).set(set).unset(unset).ifRevisionId(now._rev).commit()
    } catch {
    }
  }
  return {revision: written?._rev, putDetailsBack}
}

async function mayHaveVersion(client: SanityClient, documentId: string, releaseId: string | undefined) {
  if (!releaseId) return false
  try {
    return !!(await client.getDocument(versionIdOf(documentId, releaseId)))
  } catch {
    return true
  }
}

export async function schedulePost(
  client: SanityClient,
  {
    documentId,
    publishAt,
    details = {},
    revision,
  }: {
    documentId: string
    publishAt: Date
    details?: Record<string, unknown>
    /** The draft revision that was checked. Given, nothing newer is scheduled in its place. */
    revision?: string
  },
): Promise<{releaseId: string}> {
  const draftId = draftIdOf(documentId)
  const at = publishAt.toISOString()
  const {revision: toCopy, putDetailsBack} = await writeDetails(client, draftId, details, revision)

  let releaseId: string | undefined
  let copied = false
  try {
    ;({releaseId} = await client.releases.create({
      metadata: {title: RELEASE_TITLE, releaseType: 'scheduled', cardinality: 'one', intendedPublishAt: at},
    }))
    await client.createVersion({
      publishedId: documentId,
      baseId: draftId,
      releaseId,
      ...(toCopy ? {ifBaseRevisionId: toCopy} : {}),
    })
    copied = true
    await client.releases.schedule({releaseId, publishAt: at})
  } catch (error) {
    const nothingToKeep = wasRejected(error) || (!copied && !(await mayHaveVersion(client, documentId, releaseId)))
    if (nothingToKeep) {
      if (releaseId) await removeUnscheduled(client, documentId, releaseId)
      await putDetailsBack()
    }
    throw error
  }
  return {releaseId}
}

async function unlessAlreadySo(step: () => Promise<unknown>, alreadySo: () => Promise<boolean>) {
  try {
    await step()
  } catch (error) {
    if (!wasRejected(error) || !(await alreadySo().catch(() => false))) throw error
  }
}

export async function unlockPost(
  client: SanityClient,
  {documentId, releaseId, dateField}: {documentId: string; releaseId: string; dateField?: string},
): Promise<{scheduledFor: string | undefined}> {
  const release = await client.releases.get({releaseId})
  if (!release) return {scheduledFor: undefined}
  const scheduledFor = release.publishAt ?? release.metadata.intendedPublishAt
  const stateNow = async () => (await client.releases.get({releaseId}))?.state
  const versionId = versionIdOf(documentId, releaseId)

  if (release.state === 'scheduled' || release.state === 'scheduling') {
    await unlessAlreadySo(
      () => client.releases.unschedule({releaseId}),
      async () => {
        const state = await stateNow()
        return state !== 'scheduled' && state !== 'scheduling'
      },
    )
  }

  if (release.state !== 'archived') {
    const version = await client.getDocument<Stored>(versionId)
    if (version) {
      const draft = draftFromScheduledVersion(version, {documentId, dateField, scheduledFor})
      await unlessAlreadySo(
        () =>
          // The patch changes nothing: it is there to turn the transaction down when another Unlock
          // has already taken this version, or someone has changed it since it was read.
          client
            .transaction()
            .patch(versionId, {ifRevisionID: version._rev, unset: [CLAIM]})
            .createOrReplace(draft as Stored & {_type: string})
            .delete(versionId)
            .commit(),
        async () => !(await client.getDocument(versionId)),
      )
    }
    await unlessAlreadySo(
      () => client.releases.archive({releaseId}),
      async () => {
        const state = await stateNow()
        return state === undefined || state === 'archived' || state === 'archiving'
      },
    )
    await archived(client, releaseId)
  }
  await unlessAlreadySo(
    () => client.releases.delete({releaseId}),
    async () => (await stateNow()) === undefined,
  )
  return {scheduledFor}
}
