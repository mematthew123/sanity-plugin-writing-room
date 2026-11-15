import {type SanityClient} from 'sanity'
import {draftFromScheduledVersion, draftIdOf, versionIdOf} from './schedule'

const RELEASE_TITLE = 'Scheduled publish'

type Stored = Record<string, unknown> & {_id: string; _rev?: string; _updatedAt?: string}

function wasRejected(error: unknown): boolean {
  const status = (error as {statusCode?: unknown} | null)?.statusCode
  return typeof status === 'number' && status >= 400 && status < 500
}

async function removeUnscheduled(client: SanityClient, documentId: string, releaseId: string) {
  try {
    await client.discardVersion({releaseId, publishedId: documentId}).catch(() => undefined)
    await client.releases.archive({releaseId})
    await client.releases.delete({releaseId})
  } catch {
  }
}

async function writeDetails(
  client: SanityClient,
  draftId: string,
  details: Record<string, unknown>,
): Promise<() => Promise<void>> {
  const keys = Object.keys(details)
  if (keys.length === 0) return async () => undefined
  const before = await client.getDocument<Stored>(draftId)
  await client.patch(draftId).set(details).commit()
  return async () => {
    const set: Record<string, unknown> = {}
    const unset: string[] = []
    for (const key of keys) {
      if (before && before[key] !== undefined) set[key] = before[key]
      else unset.push(key)
    }
    await client.patch(draftId).set(set).unset(unset).commit().catch(() => undefined)
  }
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
  {documentId, publishAt, details = {}}: {documentId: string; publishAt: Date; details?: Record<string, unknown>},
): Promise<{releaseId: string}> {
  const draftId = draftIdOf(documentId)
  const at = publishAt.toISOString()
  const putDetailsBack = await writeDetails(client, draftId, details)

  let releaseId: string | undefined
  let copied = false
  try {
    ;({releaseId} = await client.releases.create({
      metadata: {title: RELEASE_TITLE, releaseType: 'scheduled', cardinality: 'one', intendedPublishAt: at},
    }))
    await client.createVersion({publishedId: documentId, baseId: draftId, releaseId})
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
          client
            .transaction()
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
        return state === undefined || state === 'archived'
      },
    )
  }
  await unlessAlreadySo(
    () => client.releases.delete({releaseId}),
    async () => (await stateNow()) === undefined,
  )
  return {scheduledFor}
}
