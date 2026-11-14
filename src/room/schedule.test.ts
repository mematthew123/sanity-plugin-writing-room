import {describe, expect, it} from 'vitest'
import {
  changeTime,
  copyId,
  draftId,
  foldBack,
  newReleaseId,
  OffTheSchedule,
  publishHeld,
  scheduleAgain,
  type ScheduleClient,
  schedulePost,
  takeOffSchedule,
  tidyDraft,
} from './schedule'

type Doc = Record<string, unknown>
interface Release {
  state: 'active' | 'scheduled' | 'published'
  at: string
  publishAt?: string
}

const FRIDAY = '2026-11-13T09:00:00.000Z'
const MONDAY = '2026-11-16T09:00:00.000Z'
const ID = 'post-1'
const R = 'rOnePost1'

/** A dataset small enough to read: documents by id, releases by id, and the steps taken, in order. */
function dataset({failOn = [] as string[]} = {}) {
  const documents = new Map<string, Doc>()
  const releases = new Map<string, Release>()
  const steps: string[] = []
  let revision = 0
  const failing = [...failOn]

  const step = (name: string) => {
    steps.push(name)
    const at = failing.indexOf(name)
    if (at >= 0) {
      failing.splice(at, 1)
      throw new Error(`${name} failed`)
    }
  }
  const put = (id: string, document: Doc) => documents.set(id, {...document, _id: id, _rev: `rev${++revision}`})
  const idOf = (publishedId: string, releaseId?: string) => (releaseId ? copyId(publishedId, releaseId) : draftId(publishedId))
  const locked = (id: string) => {
    const release = releases.get(/^versions\.([^.]+)\./.exec(id)?.[1] ?? '')
    if (release?.state === 'scheduled') throw new Error('locked')
  }

  const client: ScheduleClient = {
    read: async (id) => documents.get(id),
    setFields: async (id, fields, {ifRevision, unset = []} = {}) => {
      step('setFields')
      locked(id)
      const current = documents.get(id)
      if (!current) throw new Error(`${id} not found`)
      if (ifRevision && current._rev !== ifRevision) throw new Error('revision moved on')
      const next = {...current, ...fields}
      for (const key of unset) delete next[key]
      put(id, next)
    },
    createCopy: async ({document, publishedId, releaseId}) => {
      step('createCopy')
      put(idOf(publishedId, releaseId), document)
    },
    discardCopy: async ({publishedId, releaseId}) => {
      step(releaseId ? 'discardCopy' : 'discardDraft')
      documents.delete(idOf(publishedId, releaseId))
    },
    createRelease: async ({releaseId, at}) => {
      step('createRelease')
      releases.set(releaseId, {state: 'active', at})
    },
    setReleaseTime: async ({releaseId, at}) => {
      step('setReleaseTime')
      releases.get(releaseId)!.at = at
    },
    schedule: async ({releaseId, at}) => {
      step('schedule')
      Object.assign(releases.get(releaseId)!, {state: 'scheduled', publishAt: at})
    },
    unschedule: async ({releaseId}) => {
      step('unschedule')
      Object.assign(releases.get(releaseId)!, {state: 'active', publishAt: undefined})
    },
    publish: async ({releaseId}) => {
      step('publish')
      for (const [id, document] of documents) {
        if (id.startsWith(`versions.${releaseId}.`)) {
          put(id.slice(`versions.${releaseId}.`.length), document)
          documents.delete(id)
        }
      }
      releases.get(releaseId)!.state = 'published'
    },
    removeRelease: async ({releaseId}) => {
      step('removeRelease')
      releases.delete(releaseId)
    },
  }
  return {client, documents, releases, steps, put}
}

const post = {_type: 'post', title: 'Hello', body: [{_type: 'block', _key: 'a'}]}

function withDraft(options?: Parameters<typeof dataset>[0]) {
  const data = dataset(options)
  data.put(draftId(ID), post)
  return {...data, draft: data.documents.get(draftId(ID))!}
}

/** A Post already Scheduled for Friday, the way the room leaves one: a copy, and no draft. */
async function scheduled(options?: Parameters<typeof dataset>[0]) {
  const data = withDraft()
  await schedulePost(data.client, {documentId: ID, draft: data.draft, set: {publishedAt: FRIDAY}, at: FRIDAY, releaseId: R})
  const again = dataset(options)
  for (const [id, document] of data.documents) again.documents.set(id, document)
  for (const [id, release] of data.releases) again.releases.set(id, {...release})
  return again
}

describe('schedulePost', () => {
  it('leaves one copy of the Post: the Scheduled one, with the slug and date settled for it', async () => {
    const {client, documents, releases, draft} = withDraft()
    const set = {slug: {_type: 'slug', current: 'hello'}, publishedAt: FRIDAY}

    const result = await schedulePost(client, {documentId: ID, draft, set, at: FRIDAY, releaseId: R})

    expect(result).toEqual({releaseId: R, draft: 'removed'})
    expect([...documents.keys()]).toEqual([copyId(ID, R)])
    expect(documents.get(copyId(ID, R))).toMatchObject({...post, ...set})
    expect(releases.get(R)).toMatchObject({state: 'scheduled', publishAt: FRIDAY})
  })

  it('copies the words, not what the platform wrote on the draft', async () => {
    const {client, documents, draft} = withDraft()
    await schedulePost(client, {documentId: ID, draft: {...draft, _updatedAt: 'then', _createdAt: 'before'}, set: {}, at: FRIDAY, releaseId: R})
    const copy = documents.get(copyId(ID, R))!
    expect(copy._id).toBe(copyId(ID, R))
    expect(copy).not.toHaveProperty('_updatedAt')
    expect(copy).not.toHaveProperty('_createdAt')
  })

  it('leaves nothing behind when the release can’t be made', async () => {
    const {client, documents, releases, draft} = withDraft({failOn: ['createRelease']})
    await expect(schedulePost(client, {documentId: ID, draft, set: {}, at: FRIDAY, releaseId: R})).rejects.toThrow()
    expect([...documents.keys()]).toEqual([draftId(ID)])
    expect(releases.size).toBe(0)
  })

  it('removes the empty release when the Post can’t be copied into it', async () => {
    const {client, documents, releases, draft} = withDraft({failOn: ['createCopy']})
    await expect(schedulePost(client, {documentId: ID, draft, set: {}, at: FRIDAY, releaseId: R})).rejects.toThrow()
    expect([...documents.keys()]).toEqual([draftId(ID)])
    expect(releases.size).toBe(0)
  })

  it('removes the copy and the release when it can’t be scheduled, and the Draft is as it was', async () => {
    const {client, documents, releases, draft} = withDraft({failOn: ['schedule']})
    await expect(
      schedulePost(client, {documentId: ID, draft, set: {publishedAt: FRIDAY}, at: FRIDAY, releaseId: R}),
    ).rejects.toThrow('schedule failed')
    expect([...documents.keys()]).toEqual([draftId(ID)])
    expect(documents.get(draftId(ID))).toEqual(draft)
    expect(releases.size).toBe(0)
  })

  it('keeps a draft that gained words while the room was scheduling', async () => {
    const {client, documents, put, draft} = withDraft()
    put(draftId(ID), {...post, title: 'Hello, again'})

    const result = await schedulePost(client, {documentId: ID, draft, set: {}, at: FRIDAY, releaseId: R})

    expect(result.draft).toBe('differs')
    expect(documents.get(draftId(ID))).toMatchObject({title: 'Hello, again'})
    expect(documents.get(copyId(ID, R))).toMatchObject({title: 'Hello'})
  })

  it('stays Scheduled when the draft can’t be tidied just now', async () => {
    const {client, releases, draft} = withDraft({failOn: ['discardDraft']})
    const result = await schedulePost(client, {documentId: ID, draft, set: {}, at: FRIDAY, releaseId: R})
    expect(result.draft).toBe('left')
    expect(releases.get(R)?.state).toBe('scheduled')
  })
})

describe('tidyDraft', () => {
  it('removes a draft the Studio left behind when it says what the Scheduled copy says', async () => {
    const {client, documents, put} = await scheduled()
    put(draftId(ID), {...post, publishedAt: FRIDAY})
    expect(await tidyDraft(client, {documentId: ID, releaseId: R})).toBe('removed')
    expect(documents.has(draftId(ID))).toBe(false)
  })

  it('leaves a draft someone has since edited', async () => {
    const {client, documents, put} = await scheduled()
    put(draftId(ID), {...post, publishedAt: FRIDAY, title: 'Edited on Tuesday'})
    expect(await tidyDraft(client, {documentId: ID, releaseId: R})).toBe('differs')
    expect(documents.has(draftId(ID))).toBe(true)
  })

  it('has nothing to do when there is no draft', async () => {
    const {client, steps} = await scheduled()
    expect(await tidyDraft(client, {documentId: ID, releaseId: R})).toBe('none')
    expect(steps).toEqual([])
  })
})

describe('schedulePost, beside a draft that has changed since it was read', () => {
  it('leaves the draft, and its newer slug and date, alone', async () => {
    const {client, documents, draft, put} = withDraft()
    put(draftId(ID), {...post, publishedAt: MONDAY})

    const result = await schedulePost(client, {documentId: ID, draft, set: {publishedAt: FRIDAY}, at: FRIDAY, releaseId: R})

    expect(result.draft).toBe('left')
    expect(documents.get(draftId(ID))).toMatchObject({publishedAt: MONDAY})
    expect(documents.get(copyId(ID, R))).toMatchObject({publishedAt: FRIDAY})
  })
})

describe('takeOffSchedule, then scheduleAgain', () => {
  it('refuses a copy that has changed since it was checked', async () => {
    const {client, documents, releases} = await scheduled()
    await takeOffSchedule(client, {releaseId: R})
    const checked = documents.get(copyId(ID, R))!._rev as string
    await client.setFields(copyId(ID, R), {title: 'Hello, changed'})

    const attempt = scheduleAgain(client, {documentId: ID, releaseId: R, set: {publishedAt: MONDAY}, at: MONDAY, revision: checked})

    await expect(attempt).rejects.toThrow()
    expect(releases.get(R)?.state).toBe('active')
    expect(documents.get(copyId(ID, R))).toMatchObject({publishedAt: FRIDAY})
  })

  it('unlocks the copy and remembers the time', async () => {
    const {client, releases} = await scheduled()
    await takeOffSchedule(client, {releaseId: R})
    expect(releases.get(R)).toMatchObject({state: 'active', at: FRIDAY})
  })

  it('goes back on the schedule with what was fixed in between', async () => {
    const {client, documents, releases} = await scheduled()
    await takeOffSchedule(client, {releaseId: R})
    await client.setFields(copyId(ID, R), {title: 'Hello, fixed'})

    await scheduleAgain(client, {documentId: ID, releaseId: R, set: {}, at: FRIDAY})

    expect(releases.get(R)).toMatchObject({state: 'scheduled', publishAt: FRIDAY})
    expect(documents.get(copyId(ID, R))).toMatchObject({title: 'Hello, fixed'})
  })

  it('can go back on for another time, taking the date with it', async () => {
    const {client, documents, releases} = await scheduled()
    await takeOffSchedule(client, {releaseId: R})
    await scheduleAgain(client, {documentId: ID, releaseId: R, set: {publishedAt: MONDAY}, at: MONDAY})
    expect(releases.get(R)).toMatchObject({state: 'scheduled', at: MONDAY, publishAt: MONDAY})
    expect(documents.get(copyId(ID, R))).toMatchObject({publishedAt: MONDAY})
  })
})

describe('changeTime', () => {
  it('moves the promise, and the date written for it, in one go', async () => {
    const {client, documents, releases} = await scheduled()
    await changeTime(client, {documentId: ID, releaseId: R, set: {publishedAt: MONDAY}, at: MONDAY, was: FRIDAY})
    expect(releases.get(R)).toMatchObject({state: 'scheduled', publishAt: MONDAY})
    expect(documents.get(copyId(ID, R))).toMatchObject({publishedAt: MONDAY})
  })

  it('leaves the old promise standing when it can’t be taken off the schedule', async () => {
    const {client, releases} = await scheduled({failOn: ['unschedule']})
    await expect(changeTime(client, {documentId: ID, releaseId: R, set: {}, at: MONDAY, was: FRIDAY})).rejects.toThrow()
    expect(releases.get(R)).toMatchObject({state: 'scheduled', publishAt: FRIDAY})
  })

  it('puts the old promise back when the new time doesn’t take', async () => {
    const {client, releases} = await scheduled({failOn: ['schedule']})
    const attempt = changeTime(client, {documentId: ID, releaseId: R, set: {}, at: MONDAY, was: FRIDAY})
    await expect(attempt).rejects.not.toBeInstanceOf(OffTheSchedule)
    expect(releases.get(R)).toMatchObject({state: 'scheduled', at: FRIDAY, publishAt: FRIDAY})
  })

  it('puts the date and slug back as they were when the new time doesn’t take', async () => {
    const {client, documents, releases} = await scheduled({failOn: ['schedule']})
    const set = {publishedAt: MONDAY, slug: {_type: 'slug', current: 'hello'}}
    const attempt = changeTime(client, {documentId: ID, releaseId: R, set, at: MONDAY, was: FRIDAY})
    await expect(attempt).rejects.not.toBeInstanceOf(OffTheSchedule)
    expect(releases.get(R)).toMatchObject({state: 'scheduled', publishAt: FRIDAY})
    expect(documents.get(copyId(ID, R))).toMatchObject({publishedAt: FRIDAY})
    expect(documents.get(copyId(ID, R))).not.toHaveProperty('slug')
  })

  it('stays off the schedule when the date can’t be put back', async () => {
    const {client, releases, steps} = await scheduled({failOn: ['setFields', 'setFields']})
    const attempt = changeTime(client, {documentId: ID, releaseId: R, set: {publishedAt: MONDAY}, at: MONDAY, was: FRIDAY})
    await expect(attempt).rejects.toBeInstanceOf(OffTheSchedule)
    expect(releases.get(R)?.state).toBe('active')
    expect(steps.filter((step) => step === 'schedule')).toHaveLength(0)
  })

  it('says so when the Post has ended up off the schedule', async () => {
    const {client, releases} = await scheduled({failOn: ['schedule', 'schedule']})
    const attempt = changeTime(client, {documentId: ID, releaseId: R, set: {}, at: MONDAY, was: FRIDAY})
    await expect(attempt).rejects.toBeInstanceOf(OffTheSchedule)
    expect(releases.get(R)).toMatchObject({state: 'active', at: FRIDAY})
  })
})

describe('publishHeld', () => {
  it('publishes the copy that was taken off the schedule, dated now', async () => {
    const {client, documents, releases} = await scheduled()
    await takeOffSchedule(client, {releaseId: R})
    await publishHeld(client, {documentId: ID, releaseId: R, set: {publishedAt: '2026-11-11T10:00:00.000Z'}})
    expect([...documents.keys()]).toEqual([ID])
    expect(documents.get(ID)).toMatchObject({title: 'Hello', publishedAt: '2026-11-11T10:00:00.000Z'})
    expect(releases.get(R)?.state).toBe('published')
  })
})

describe('foldBack', () => {
  it('turns a Post whose time went by into an ordinary draft, and removes its release', async () => {
    const {client, documents, releases} = await scheduled()
    await takeOffSchedule(client, {releaseId: R})

    expect(await foldBack(client, {documentId: ID, releaseId: R})).toBe('folded')

    expect([...documents.keys()]).toEqual([draftId(ID)])
    expect(documents.get(draftId(ID))).toMatchObject({...post, publishedAt: FRIDAY})
    expect(releases.size).toBe(0)
  })

  it('touches nothing when a draft with other words is already there', async () => {
    const {client, documents, releases, put} = await scheduled()
    await takeOffSchedule(client, {releaseId: R})
    put(draftId(ID), {...post, title: 'Someone else’s edit'})

    expect(await foldBack(client, {documentId: ID, releaseId: R})).toBe('kept')

    expect(documents.has(copyId(ID, R))).toBe(true)
    expect(documents.get(draftId(ID))).toMatchObject({title: 'Someone else’s edit'})
    expect(releases.has(R)).toBe(true)
  })

  it('keeps the words if the copy can’t be removed after the draft is written', async () => {
    const {client, documents} = await scheduled({failOn: ['discardCopy']})
    await client.unschedule({releaseId: R})
    await expect(foldBack(client, {documentId: ID, releaseId: R})).rejects.toThrow()
    expect(documents.has(draftId(ID))).toBe(true)
    expect(documents.has(copyId(ID, R))).toBe(true)
  })
})

describe('newReleaseId', () => {
  it('is an r and eight letters or digits, as the Studio’s are', () => {
    expect(newReleaseId()).toMatch(/^r[a-zA-Z0-9]{8}$/)
    expect(newReleaseId(() => 0)).toBe('raaaaaaaa')
  })
})
