import {isSame, sameWords} from './promised'

type Doc = Record<string, unknown>

/**
 * The few writes scheduling is made of, so they can be followed, and undone, one at a time. In the
 * Studio this is its own client; see `scheduleClient`.
 */
export interface ScheduleClient {
  read(id: string): Promise<Doc | undefined>
  /**
   * Sets fields on a copy that isn't locked; a field given as `undefined` is removed. With
   * `ifRevision`, only if the copy is still at that revision: otherwise it fails and nothing is written.
   */
  setFields(id: string, fields: Doc, options?: {ifRevision?: string}): Promise<unknown>
  /** Writes `document` as a copy: in `releaseId`, or as the draft without one. */
  createCopy(args: {document: Doc; publishedId: string; releaseId?: string}): Promise<unknown>
  /** Removes a copy: the one in `releaseId`, or the draft without one. */
  discardCopy(args: {publishedId: string; releaseId?: string}): Promise<unknown>
  /**
   * Removes the draft, only if it is still at `ifRevision`: otherwise it fails and the draft stays.
   * A draft can be written to at any moment, so the room never removes one it hasn't just read.
   */
  discardDraft(args: {publishedId: string; ifRevision: string}): Promise<unknown>
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
  if (!sameWords(draft, copy) || typeof draft._rev !== 'string') return 'differs'
  return discardDraftAt(client, documentId, draft._rev)
}

/** Removes the draft if it is still at `revision`. If it has moved on, it holds something newer, and stays. */
async function discardDraftAt(
  client: ScheduleClient,
  documentId: string,
  revision: string,
): Promise<'removed' | 'differs' | 'none'> {
  try {
    await client.discardDraft({publishedId: documentId, ifRevision: revision})
    return 'removed'
  } catch (error) {
    // Only the server knows why it refused, so ask what is there now.
    const now = await client.read(draftId(documentId))
    if (!now) return 'none'
    if (now._rev !== revision) return 'differs'
    throw error
  }
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

  // The draft goes only if it is still the one that was copied, and the server is the judge of
  // that: a newer revision holds something the copy doesn't, and nothing is written to it on the way.
  const tidied =
    typeof draft._rev === 'string'
      ? await discardDraftAt(client, documentId, draft._rev).catch(() => 'left' as const)
      : ('left' as const)
  return {releaseId, draft: tidied}
}

/** The copy has changed since it was checked, so what would be promised isn't what was checked. */
export class ChangedSinceChecked extends Error {
  constructor(cause?: unknown) {
    super('The copy changed after it was checked', {cause})
    this.name = 'ChangedSinceChecked'
  }
}

/** "Edit it": off the schedule, so the copy can change. The release remembers its time. */
export async function takeOffSchedule(client: ScheduleClient, {releaseId}: {releaseId: string}): Promise<void> {
  await client.unschedule({releaseId})
}

/**
 * Puts a Post that was taken off the schedule back on it, for the same time or a new one.
 *
 * `checked` is the revision of the copy that passed the publish check. The copy can be edited
 * until the moment it is scheduled, so it goes back on only if it is still that revision; if not,
 * `ChangedSinceChecked` is thrown and nothing is promised.
 */
export async function scheduleAgain(
  client: ScheduleClient,
  {
    documentId,
    releaseId,
    set,
    at,
    checked,
  }: {documentId: string; releaseId: string; set: Doc; at: string; checked?: string},
): Promise<void> {
  const id = copyId(documentId, releaseId)
  if (Object.keys(set).length > 0) {
    try {
      await client.setFields(id, set, checked ? {ifRevision: checked} : undefined)
    } catch (error) {
      // Only the server knows whether it refused because of the revision, so ask it.
      if (checked && (await client.read(id))?._rev !== checked) throw new ChangedSinceChecked(error)
      throw error
    }
  } else if (checked && (await client.read(id))?._rev !== checked) {
    throw new ChangedSinceChecked()
  }
  await client.setReleaseTime({releaseId, at})
  await client.schedule({releaseId, at})
}

/**
 * "Change the time" on a Scheduled Post. The platform locks the time with the words, so it comes
 * off the schedule and goes back on. If the new time doesn't take, the old promise is restored; if
 * even that fails, the Post is left off the schedule and `OffTheSchedule` says so.
 */
export async function changeTime(
  client: ScheduleClient,
  {documentId, releaseId, set, at, was}: {documentId: string; releaseId: string; set: Doc; at: string; was: string},
): Promise<void> {
  // What `set` is about to replace, so the old promise can be restored whole: its time and its date.
  const before = (await client.read(copyId(documentId, releaseId))) ?? {}
  const previous = Object.fromEntries(Object.keys(set).map((field) => [field, before[field]]))
  await client.unschedule({releaseId})
  try {
    await scheduleAgain(client, {documentId, releaseId, set, at})
  } catch (error) {
    try {
      // Off the schedule, anyone can edit the copy. Only what this change wrote is taken back, and
      // only if the copy hasn't moved since it was read: a field someone else has since set is
      // theirs, and then the Post stays off the schedule for a person to look at.
      const now = (await client.read(copyId(documentId, releaseId))) ?? {}
      const undo: Doc = {}
      for (const field of Object.keys(set)) {
        if (isSame(now[field], previous[field])) continue
        if (!isSame(now[field], set[field])) throw new Error(`${field} was changed by someone else`, {cause: error})
        undo[field] = previous[field]
      }
      if (Object.keys(undo).length > 0) {
        const ifRevision = typeof now._rev === 'string' ? now._rev : undefined
        await client.setFields(copyId(documentId, releaseId), undo, {ifRevision})
      }
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
