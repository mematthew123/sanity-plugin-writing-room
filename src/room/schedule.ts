import {sameWords} from './promised'

type Doc = Record<string, unknown>

/**
 * The few writes scheduling is made of, so they can be followed, and undone, one at a time. In the
 * Studio this is its own client; see `scheduleClient`.
 */
export interface ScheduleClient {
  read(id: string): Promise<Doc | undefined>
  /** Sets fields on a copy that isn't locked. */
  setFields(id: string, fields: Doc): Promise<unknown>
  /** Writes `document` as a copy: in `releaseId`, or as the draft without one. */
  createCopy(args: {document: Doc; publishedId: string; releaseId?: string}): Promise<unknown>
  /** Removes a copy: the one in `releaseId`, or the draft without one. */
  discardCopy(args: {publishedId: string; releaseId?: string}): Promise<unknown>
  createRelease(args: {releaseId: string; title: string; at: string}): Promise<unknown>
  setReleaseTime(args: {releaseId: string; at: string}): Promise<unknown>
  schedule(args: {releaseId: string; at: string}): Promise<unknown>
  unschedule(args: {releaseId: string}): Promise<unknown>
  publish(args: {releaseId: string}): Promise<unknown>
  /** An active release can't be deleted outright, so this archives it first. */
  removeRelease(args: {releaseId: string}): Promise<unknown>
}

export const draftId = (documentId: string) => `drafts.${documentId}`
export const copyId = (documentId: string, releaseId: string) => `versions.${releaseId}.${documentId}`

/** What the Studio calls its own one-document releases, so both list alike. */
export const ONE_POST_RELEASE_TITLE = 'Scheduled publish'

const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

/** A release id in the shape the Studio gives its own: `r` and eight letters or digits. */
export function newReleaseId(random: () => number = Math.random): string {
  let id = 'r'
  for (let index = 0; index < 8; index++) id += ALPHABET[Math.floor(random() * ALPHABET.length)]
  return id
}

/** A document's own fields, without what the platform writes on each copy. */
function content(document: Doc): Doc {
  const {_id: _, _rev: __, _updatedAt: ___, _createdAt: ____, ...rest} = document
  return rest
}

const quietly = (attempt: () => Promise<unknown>) => attempt().catch(() => undefined)

/**
 * Removes the draft once a Scheduled copy says the same thing (ADR-0004). `differs` means the
 * draft holds words the copy doesn't: those are someone's, and they stay.
 */
export async function tidyDraft(
  client: ScheduleClient,
  {documentId, releaseId}: {documentId: string; releaseId: string},
): Promise<'none' | 'removed' | 'differs'> {
  const [draft, copy] = await Promise.all([client.read(draftId(documentId)), client.read(copyId(documentId, releaseId))])
  if (!draft) return 'none'
  if (!sameWords(draft, copy)) return 'differs'
  await client.discardCopy({publishedId: documentId})
  return 'removed'
}

/**
 * Promises a Draft to readers at `at`: a one-Post release, the draft copied into it with `set` (the
 * slug and date settled for this promise), scheduled; then the draft tidied away, so the Scheduled
 * copy is the Post.
 *
 * If a step fails the earlier ones are undone, and the Post is a Draft as it was. Once it is
 * scheduled, nothing is undone: a draft that can't be removed just now is left for the next visit.
 */
export async function schedulePost(
  client: ScheduleClient,
  {
    documentId,
    draft,
    set,
    at,
    releaseId = newReleaseId(),
  }: {documentId: string; draft: Doc; set: Doc; at: string; releaseId?: string},
): Promise<{releaseId: string; draft: 'removed' | 'differs' | 'none' | 'left'}> {
  await client.createRelease({releaseId, title: ONE_POST_RELEASE_TITLE, at})
  try {
    const document = {...content(draft), ...set, _id: copyId(documentId, releaseId)}
    await client.createCopy({document, publishedId: documentId, releaseId})
    try {
      await client.schedule({releaseId, at})
    } catch (error) {
      await quietly(() => client.discardCopy({publishedId: documentId, releaseId}))
      throw error
    }
  } catch (error) {
    await quietly(() => client.removeRelease({releaseId}))
    throw error
  }

  // The copy took `set`, so a draft that matches it has to have it too.
  const tidied = await (async () => {
    if (Object.keys(set).length > 0) await client.setFields(draftId(documentId), set)
    return tidyDraft(client, {documentId, releaseId})
  })().catch(() => 'left' as const)
  return {releaseId, draft: tidied}
}

/** "Edit it": off the schedule, so the copy can change. The release remembers its time. */
export async function takeOffSchedule(client: ScheduleClient, {releaseId}: {releaseId: string}): Promise<void> {
  await client.unschedule({releaseId})
}

/** Puts a Post that was taken off the schedule back on it, for the same time or a new one. */
export async function scheduleAgain(
  client: ScheduleClient,
  {documentId, releaseId, set, at}: {documentId: string; releaseId: string; set: Doc; at: string},
): Promise<void> {
  if (Object.keys(set).length > 0) await client.setFields(copyId(documentId, releaseId), set)
  await client.setReleaseTime({releaseId, at})
  await client.schedule({releaseId, at})
}

/**
 * "Change the time" on a Scheduled Post. The platform locks the time with the words, so it comes
 * off the schedule and goes back on. If the new time doesn't take, the old promise is restored; if
 * even that fails, the Post is left off the schedule and `held` says so.
 */
export async function changeTime(
  client: ScheduleClient,
  {documentId, releaseId, set, at, was}: {documentId: string; releaseId: string; set: Doc; at: string; was: string},
): Promise<void> {
  await client.unschedule({releaseId})
  try {
    await scheduleAgain(client, {documentId, releaseId, set, at})
  } catch (error) {
    try {
      await client.setReleaseTime({releaseId, at: was})
      await client.schedule({releaseId, at: was})
    } catch {
      throw new OffTheSchedule(error)
    }
    throw error
  }
}

/** A change of time failed and the old one couldn't be put back: the Post is no longer Scheduled. */
export class OffTheSchedule extends Error {
  constructor(cause: unknown) {
    super('The Post is off the schedule', {cause})
    this.name = 'OffTheSchedule'
  }
}

/** "Publish now" on a Post that was taken off the schedule: its copy is what goes live. */
export async function publishHeld(
  client: ScheduleClient,
  {documentId, releaseId, set}: {documentId: string; releaseId: string; set: Doc},
): Promise<void> {
  if (Object.keys(set).length > 0) await client.setFields(copyId(documentId, releaseId), set)
  await client.publish({releaseId})
}

/**
 * A Post taken off the schedule whose time has gone by becomes an ordinary draft again, and its
 * one-Post release is removed (ADR-0004). `kept` means a draft with other words was already there:
 * nothing is touched, because the room never picks between two people's words.
 */
export async function foldBack(
  client: ScheduleClient,
  {documentId, releaseId}: {documentId: string; releaseId: string},
): Promise<'folded' | 'kept' | 'gone'> {
  const [draft, copy] = await Promise.all([client.read(draftId(documentId)), client.read(copyId(documentId, releaseId))])
  if (!copy) return 'gone'
  if (draft && !sameWords(draft, copy)) return 'kept'
  if (!draft) {
    await client.createCopy({document: {...content(copy), _id: draftId(documentId)}, publishedId: documentId})
  }
  await client.discardCopy({publishedId: documentId, releaseId})
  await quietly(() => client.removeRelease({releaseId}))
  return 'folded'
}
