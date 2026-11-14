import {describe, expect, it} from 'vitest'
import {describeRelease, findPromise, promisedPosts, promiseOf, releaseOfCopy, sameWords} from './promised'

const FRIDAY = '2026-11-13T09:00:00Z'
const onePost = (state: string, extra: object = {}) => ({
  name: 'rOnePost',
  state,
  metadata: {cardinality: 'one', releaseType: 'scheduled', intendedPublishAt: FRIDAY},
  ...extra,
})

describe('promiseOf', () => {
  it('holds while the release is scheduled, at the time the platform will publish', () => {
    expect(promiseOf(onePost('scheduled', {publishAt: FRIDAY}))).toEqual({at: FRIDAY, held: false})
    expect(promiseOf(onePost('scheduling'))).toEqual({at: FRIDAY, held: false})
  })

  it('remembers its time once taken off the schedule', () => {
    expect(promiseOf(onePost('active'))).toEqual({at: FRIDAY, held: true})
  })

  it('is no promise once published or archived', () => {
    expect(promiseOf(onePost('published'))).toBeNull()
    expect(promiseOf(onePost('archived'))).toBeNull()
  })

  it('is no promise for a Release of many, which is the Studio’s to schedule', () => {
    const release = {name: 'rSummer', state: 'scheduled', publishAt: FRIDAY, metadata: {cardinality: 'many'}}
    expect(promiseOf(release)).toBeNull()
    expect(promiseOf({name: 'rOld', state: 'scheduled', publishAt: FRIDAY})).toBeNull()
  })

  it('is no promise without a time', () => {
    expect(promiseOf({name: 'r', state: 'active', metadata: {cardinality: 'one', releaseType: 'scheduled'}})).toBeNull()
    expect(promiseOf(null)).toBeNull()
  })
})

describe('describeRelease', () => {
  it('goes by its own title', () => {
    expect(describeRelease({name: 'rSummer', state: 'active', metadata: {title: 'Summer drop'}})).toEqual({
      title: 'Summer drop',
    })
  })

  it('says when it is scheduled', () => {
    const release = {name: 'rSummer', state: 'scheduled', publishAt: FRIDAY, metadata: {title: 'Summer drop'}}
    expect(describeRelease(release)).toEqual({title: 'Summer drop', scheduledFor: FRIDAY})
  })

  it('keeps an intended time to itself until the Release is actually scheduled', () => {
    const release = {name: 'rSummer', state: 'active', metadata: {title: 'Summer drop', intendedPublishAt: FRIDAY}}
    expect(describeRelease(release).scheduledFor).toBeUndefined()
  })

  it('has words for a Release nobody named', () => {
    expect(describeRelease({name: 'r', state: 'active', metadata: {title: ' '}}).title).toBe('an untitled release')
  })
})

describe('releaseOfCopy', () => {
  it('reads the release from a copy’s id', () => {
    expect(releaseOfCopy('versions.rSummer.post-1')).toBe('rSummer')
    expect(releaseOfCopy('versions.rSummer.post.with.dots')).toBe('rSummer')
  })

  it('is null for a draft or a published document', () => {
    expect(releaseOfCopy('drafts.post-1')).toBeNull()
    expect(releaseOfCopy('post-1')).toBeNull()
  })
})

describe('findPromise', () => {
  const summer = {name: 'rSummer', state: 'scheduled', publishAt: FRIDAY, metadata: {cardinality: 'many', title: 'Summer drop'}}

  it('finds the Post’s own schedule among the releases it has copies in', () => {
    const mine = onePost('scheduled', {publishAt: FRIDAY})
    expect(findPromise([summer, mine], ['drafts.p', 'versions.rSummer.p', 'versions.rOnePost.p'])).toEqual({
      release: mine,
      promise: {at: FRIDAY, held: false},
    })
  })

  it('is null when the only schedule is another Post’s', () => {
    expect(findPromise([onePost('scheduled')], ['drafts.p'])).toBeNull()
  })

  it('is null for a Post that is only in a Release of many', () => {
    expect(findPromise([summer], ['versions.rSummer.p'])).toBeNull()
  })

  it('prefers the one that is really scheduled, should the Studio have left two', () => {
    const held = {...onePost('active'), name: 'rHeld'}
    const live = {...onePost('scheduled'), name: 'rLive'}
    expect(findPromise([held, live], ['versions.rHeld.p', 'versions.rLive.p'])?.release.name).toBe('rLive')
  })
})

describe('promisedPosts', () => {
  const summer = {name: 'rSummer', state: 'active', metadata: {cardinality: 'many', title: 'Summer drop'}}
  const one = {...onePost('scheduled', {publishAt: FRIDAY}), name: 'rOne'}
  const two = {...onePost('active'), name: 'rTwo'}

  it('lists each Post with a promise, most recently edited first', () => {
    const copies = [
      {_id: 'versions.rOne.a', _type: 'post', _updatedAt: '2026-11-09T10:00:00Z'},
      {_id: 'versions.rTwo.b', _type: 'note', _updatedAt: '2026-11-10T10:00:00Z'},
    ]
    expect(promisedPosts([one, two], copies)).toEqual([
      {documentId: 'b', documentType: 'note', releaseId: 'rTwo', promise: {at: FRIDAY, held: true}, editedAt: '2026-11-10T10:00:00Z'},
      {documentId: 'a', documentType: 'post', releaseId: 'rOne', promise: {at: FRIDAY, held: false}, editedAt: '2026-11-09T10:00:00Z'},
    ])
  })

  it('leaves out copies in a Release of many, which the Lobby never lists', () => {
    expect(promisedPosts([summer, one], [{_id: 'versions.rSummer.a', _type: 'post'}])).toEqual([])
  })

  it('leaves out a copy whose release is no longer there', () => {
    expect(promisedPosts([], [{_id: 'versions.rGone.a', _type: 'post'}])).toEqual([])
  })

  it('keeps a document id that has dots in it whole', () => {
    expect(promisedPosts([one], [{_id: 'versions.rOne.a.b.c', _type: 'post'}])[0]?.documentId).toBe('a.b.c')
  })

  it('lists a Post once, by the promise that is really scheduled', () => {
    const copies = [
      {_id: 'versions.rTwo.a', _type: 'post'},
      {_id: 'versions.rOne.a', _type: 'post'},
    ]
    expect(promisedPosts([one, two], copies)).toMatchObject([{documentId: 'a', releaseId: 'rOne'}])
  })
})

describe('promisedPosts and findPromise', () => {
  const MONDAY = '2026-11-16T09:00:00Z'
  const later = {...onePost('scheduled', {publishAt: MONDAY}), name: 'rLater'}
  const sooner = {...onePost('scheduled', {publishAt: FRIDAY}), name: 'rSooner'}

  it('agree on the nearest time when a Post is scheduled twice, whichever copy comes first', () => {
    for (const ids of [['versions.rLater.a', 'versions.rSooner.a'], ['versions.rSooner.a', 'versions.rLater.a']]) {
      const copies = ids.map((_id) => ({_id, _type: 'post'}))
      expect(promisedPosts([later, sooner], copies)).toMatchObject([{documentId: 'a', releaseId: 'rSooner'}])
      expect(findPromise([later, sooner], ids)?.release.name).toBe('rSooner')
    }
  })
})

describe('sameWords', () => {
  const body = [{_type: 'block', _key: 'a', children: [{_type: 'span', _key: 'b', text: 'Hello', marks: []}]}]
  const draft = {_id: 'drafts.p', _type: 'post', _rev: 'r1', _updatedAt: '2026-11-09T10:00:00Z', title: 'Hello', body}

  it('is true for copies that differ only in what the platform writes', () => {
    const copy = {...draft, _id: 'versions.rOnePost.p', _rev: 'r2', _updatedAt: '2026-11-10T10:00:00Z', body: structuredClone(body)}
    expect(sameWords(draft, copy)).toBe(true)
  })

  it('is false when a word differs, however deep', () => {
    const edited = structuredClone(body)
    edited[0]!.children[0]!.text = 'Hello there'
    expect(sameWords(draft, {...draft, body: edited})).toBe(false)
  })

  it('is false when a field is there in one and not the other', () => {
    expect(sameWords(draft, {...draft, excerpt: 'A note'})).toBe(false)
    expect(sameWords({...draft, excerpt: 'A note'}, draft)).toBe(false)
  })

  it('is false when blocks are in another order', () => {
    const two = [...body, {...body[0]!, _key: 'c'}]
    expect(sameWords({...draft, body: two}, {...draft, body: [...two].reverse()})).toBe(false)
  })

  it('is false when either copy is missing, so nothing is removed on a guess', () => {
    expect(sameWords(draft, null)).toBe(false)
    expect(sameWords(undefined, draft)).toBe(false)
  })
})
