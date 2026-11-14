import {sameWords} from './promised'

type Doc = Record<string, unknown>

/** The writes scheduling is made of, one at a time, so each can be undone. */
export interface ScheduleClient {
  read(id: string): Promise<Doc | undefined>
  /**
   * `undefined` removes a field. With `ifRevision`, fails unless the copy is still at that revision.
   * Resolves to the copy as written, for its new revision.
   */
  setFields(id: string, fields: Doc, options?: {ifRevision?: string}): Promise<Doc | undefined>
  /** Without a `releaseId`, the copy is the draft. */
  createCopy(args: {document: Doc; publishedId: string; releaseId?: string}): Promise<unknown>
  discardCopy(args: {publishedId: string; releaseId?: string}): Promise<unknown>
  /** Fails, and leaves the draft, unless it is still at `ifRevision`. */
  discardDraft(args: {publishedId: string; ifRevision: string}): Promise<unknown>
  createRelease(args: {releaseId: string; title: string; at: string}): Promise<unknown>
  setReleaseTime(args: {releaseId: string; at: string}): Promise<unknown>
  schedule(args: {releaseId: string; at: string}): Promise<unknown>
  unschedule(args: {releaseId: string}): Promise<unknown>
  publish(args: {releaseId: string}): Promise<unknown>
  removeRelease(args: {releaseId: string}): Promise<unknown>
}

export const draftId = (documentId: string) => `drafts.${documentId}`
export const copyId = (documentId: string, releaseId: string) => `versions.${releaseId}.${documentId}`

/** The Studio's own name for a one-document release. */
export const ONE_POST_RELEASE_TITLE = 'Scheduled publish'

const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

/** The shape the Studio gives its own release ids. */
export function newReleaseId(random: () => number = Math.random): string {
  let id = 'r'
  for (let index = 0; index < 8; index++) id += ALPHABET[Math.floor(random() * ALPHABET.length)]
  return id
}

function content(document: Doc): Doc {
  const {_id: _, _rev: __, _updatedAt: ___, _createdAt: ____, ...rest} = document
  return rest
}

const quietly = (attempt: () => Promise<unknown>) => attempt().catch(() => undefined)

/** Removes a draft that says what the Scheduled copy says. One that `differs` is someone's words, and stays. */
export async function tidyDraft(
  client: ScheduleClient,
  {documentId, releaseId}: {documentId: string; releaseId: string},
): Promise<'none' | 'removed' | 'differs'> {
  const [draft, copy] = await Promise.all([client.read(draftId(documentId)), client.read(copyId(documentId, releaseId))])
  if (!draft) return 'none'
  if (!sameWords(draft, copy) || typeof draft._rev !== 'string') return 'differs'
  return discardDraftAt(client, documentId, draft._rev)
}

async function discardDraftAt(
  client: ScheduleClient,
  documentId: string,
  revision: string,
): Promise<'removed' | 'differs' | 'none'> {
  try {
    await client.discardDraft({publishedId: documentId, ifRevision: revision})
    return 'removed'
  } catch (error) {
    const now = await client.read(draftId(documentId))
    if (!now) return 'none'
    if (now._rev !== revision) return 'differs'
    throw error
  }
}

/**
 * Schedules a Draft for `at` and removes the draft, so the Scheduled copy is the Post. A step that
 * fails undoes the earlier ones; a draft that can't be removed is `left` for the next visit.
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

  // Only the revision that was copied: a newer one holds something the copy doesn't.
  const tidied =
    typeof draft._rev === 'string'
      ? await discardDraftAt(client, documentId, draft._rev).catch(() => 'left' as const)
      : ('left' as const)
  return {releaseId, draft: tidied}
}

export class ChangedSinceChecked extends Error {
  constructor(cause?: unknown) {
    super('The copy changed after it was checked', {cause})
    this.name = 'ChangedSinceChecked'
  }
}

/** The release remembers its time. */
export async function takeOffSchedule(client: ScheduleClient, {releaseId}: {releaseId: string}): Promise<void> {
  await client.unschedule({releaseId})
}

/** The copy changed while it was being scheduled, and couldn't be taken back off: it may go live unchecked. */
export class StillScheduled extends Error {
  constructor(cause?: unknown) {
    super('The copy changed and may still be scheduled', {cause})
    this.name = 'StillScheduled'
  }
}

/** Writes `set` to the copy only if it is still at `checked`. Resolves to the revision that is now the checked one. */
async function writeChecked(
  client: ScheduleClient,
  id: string,
  set: Doc,
  checked: string | undefined,
): Promise<string | undefined> {
  if (Object.keys(set).length === 0) {
    if (checked && (await client.read(id))?._rev !== checked) throw new ChangedSinceChecked()
    return checked
  }
  try {
    const written = await client.setFields(id, set, checked ? {ifRevision: checked} : undefined)
    if (!checked) return undefined
    return typeof written?._rev === 'string' ? written._rev : ((await client.read(id))?._rev as string | undefined)
  } catch (error) {
    if (checked && (await client.read(id))?._rev !== checked) throw new ChangedSinceChecked(error)
    throw error
  }
}

/**
 * Schedules the release, then makes sure what it locked is `expected`. Scheduling takes no
 * revision, so the copy is read once it is locked and can't change. If it isn't `expected`, or
 * can't be read, it comes back off the schedule; if even that fails, `StillScheduled` says so.
 */
async function lock(
  client: ScheduleClient,
  {id, releaseId, at, expected}: {id: string; releaseId: string; at: string; expected: string | undefined},
): Promise<void> {
  await client.setReleaseTime({releaseId, at})
  await client.schedule({releaseId, at})
  if (!expected) return

  const backOff = async (reason: unknown) => {
    try {
      await client.unschedule({releaseId})
    } catch (error) {
      throw new StillScheduled(error)
    }
    throw reason
  }
  let locked: Doc | undefined
  try {
    locked = await client.read(id)
  } catch (error) {
    return backOff(error)
  }
  if (locked?._rev !== expected) return backOff(new ChangedSinceChecked())
}

/**
 * Puts a Post that was taken off the schedule back on it. With `checked`, the revision that passed
 * the publish check, only that revision (with `set`) is promised: otherwise `ChangedSinceChecked`.
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
  const expected = await writeChecked(client, id, set, checked)
  await lock(client, {id, releaseId, at, expected})
}

/**
 * The platform locks the time with the words, so the Post comes off the schedule and goes back on.
 * A new time that doesn't take restores the old one. Off the schedule anyone can edit the copy, so
 * at every step it must still be the revision this change knows: if it isn't, or the old time
 * can't be restored, the Post stays off the schedule and `OffTheSchedule` is thrown.
 */
export async function changeTime(
  client: ScheduleClient,
  {documentId, releaseId, set, at, was}: {documentId: string; releaseId: string; set: Doc; at: string; was: string},
): Promise<void> {
  const id = copyId(documentId, releaseId)
  const before = (await client.read(id)) ?? {}
  const previous = Object.fromEntries(Object.keys(set).map((field) => [field, before[field]]))
  // Locked, so this is the revision that was checked when it was scheduled.
  const checked = typeof before._rev === 'string' ? before._rev : undefined
  await client.unschedule({releaseId})

  let known = checked
  try {
    known = await writeChecked(client, id, set, checked)
    await lock(client, {id, releaseId, at, expected: known})
  } catch (error) {
    if (error instanceof StillScheduled) throw error
    if (error instanceof ChangedSinceChecked) throw new OffTheSchedule(error)
    try {
      // Only this change's own write is taken back, and only from the revision it left.
      const restored = known === checked ? known : await writeChecked(client, id, previous, known)
      await lock(client, {id, releaseId, at: was, expected: restored})
    } catch (failed) {
      if (failed instanceof StillScheduled) throw failed
      throw new OffTheSchedule(error)
    }
    throw error
  }
}

export class OffTheSchedule extends Error {
  constructor(cause: unknown) {
    super('The Post is off the schedule', {cause})
    this.name = 'OffTheSchedule'
  }
}

/** Publishes a Post that was taken off the schedule. */
export async function publishHeld(
  client: ScheduleClient,
  {documentId, releaseId, set}: {documentId: string; releaseId: string; set: Doc},
): Promise<void> {
  if (Object.keys(set).length > 0) await client.setFields(copyId(documentId, releaseId), set)
  await client.publish({releaseId})
}

/**
 * Turns a Post taken off the schedule back into an ordinary draft and removes its release. `kept`
 * means a draft with other words was already there, so nothing was touched.
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
