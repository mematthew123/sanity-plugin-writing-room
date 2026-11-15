import {type SanityClient} from 'sanity'
import {draftFromScheduledVersion, draftIdOf, versionIdOf} from './schedule'

/** Studio's own name for the release behind a scheduled draft. */
const RELEASE_TITLE = 'Scheduled publish'

type Stored = Record<string, unknown> & {_id: string; _rev?: string; _updatedAt?: string}

/** A request Sanity turned down, as against one whose fate isn't known (a timeout, a dropped connection). */
function wasRejected(error: unknown): boolean {
  const status = (error as {statusCode?: unknown} | null)?.statusCode
  return typeof status === 'number' && status >= 400 && status < 500
}

/** Takes apart a release that never got scheduled. Best effort: what it leaves, Unlock can still clear. */
async function removeUnscheduled(client: SanityClient, documentId: string, releaseId: string) {
  try {
    await client.discardVersion({releaseId, publishedId: documentId}).catch(() => undefined)
    await client.releases.archive({releaseId})
    await client.releases.delete({releaseId})
  } catch {
    // Left as a Stale version; the room says so and offers Unlock.
  }
}

/**
 * Writes the details to the draft and hands back the way to undo it: each field as it was, or gone
 * if it wasn't there. Only those fields are touched, so words written meanwhile are left alone.
 */
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
    // Best effort: the schedule has already failed, and that is the error the Writer hears of.
    await client.patch(draftId).set(set).unset(unset).commit().catch(() => undefined)
  }
}

/** Whether the release holds a copy of the document. When that can't be read, it may. */
async function mayHaveVersion(client: SanityClient, documentId: string, releaseId: string | undefined) {
  if (!releaseId) return false
  try {
    return !!(await client.getDocument(versionIdOf(documentId, releaseId)))
  } catch {
    return true
  }
}

/**
 * Schedules the draft as Studio does: a single-document release, a copy of the draft in it (the
 * Scheduled version), then the schedule. `details` are written to the draft first, so the copy
 * carries them.
 *
 * The steps aren't one transaction. If Sanity turns one down, or the copy was never made, what was
 * made is removed and the draft's details are put back: a date stamped for a schedule that isn't
 * must not be there for the next publish. If a step is lost on the way once the copy exists,
 * nothing is touched: it may have landed, the release's own state says, and Unlock clears it.
 */
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
    // A release with no copy in it is one the room would never see, so it can't be left for Unlock.
    const nothingToKeep = wasRejected(error) || (!copied && !(await mayHaveVersion(client, documentId, releaseId)))
    if (nothingToKeep) {
      if (releaseId) await removeUnscheduled(client, documentId, releaseId)
      await putDetailsBack()
    }
    throw error
  }
  return {releaseId}
}

/**
 * Unlock: takes the document off the schedule, makes the Scheduled version the draft, and dismisses
 * the version and its release. Each step looks at what is there first, so an Unlock that was cut
 * short can be run again.
 *
 * @returns the time the document was scheduled for, to offer again.
 */
export async function unlockPost(
  client: SanityClient,
  {documentId, releaseId, dateField}: {documentId: string; releaseId: string; dateField?: string},
): Promise<{scheduledFor: string | undefined}> {
  const release = await client.releases.get({releaseId})
  if (!release) return {scheduledFor: undefined}
  const scheduledFor = release.publishAt ?? release.metadata.intendedPublishAt

  if (release.state === 'scheduled' || release.state === 'scheduling') {
    await client.releases.unschedule({releaseId})
  }

  if (release.state !== 'archived') {
    const version = await client.getDocument<Stored>(versionIdOf(documentId, releaseId))
    if (version) {
      // The version before the draft: what was going to go live is what the Writer picks up.
      await client.createOrReplace(
        draftFromScheduledVersion(version, {documentId, dateField, scheduledFor}) as Stored & {_type: string},
      )
      // And gone before the release is archived: an archived release won't let go of its versions.
      await client.discardVersion({releaseId, publishedId: documentId})
    }
    await client.releases.archive({releaseId})
  }
  await client.releases.delete({releaseId})
  return {scheduledFor}
}
