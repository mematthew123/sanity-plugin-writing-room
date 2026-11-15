import {type SanityClient} from 'sanity'
import {describe, expect, it} from 'vitest'
import {schedulePost, unlockPost} from './schedule-actions'

const FRIDAY = '2026-11-20T09:00:00.000Z'

interface Fake {
  release?: Record<string, unknown>
  version?: Record<string, unknown> | null
  draft?: Record<string, unknown> | null
  /** Calls to fail, by name, with the error to throw. */
  fail?: Record<string, unknown>
}

/** A client that writes down what it's asked, in order. */
function fakeClient({release, version = null, draft = null, fail = {}}: Fake = {}) {
  const calls: Array<[string, unknown?]> = []
  const run = async <T,>(name: string, args: unknown, result?: T): Promise<T> => {
    calls.push([name, args])
    if (name in fail) throw fail[name]
    return result as T
  }
  const client = {
    patch: (id: string) => ({
      set: (set: unknown) => ({
        commit: () => run('patch', {id, set}),
        unset: (unset: unknown) => ({commit: () => run('patch', {id, set, unset})}),
      }),
    }),
    releases: {
      create: (args: unknown) => run('releases.create', args, {releaseId: 'rNEW'}),
      schedule: (args: unknown) => run('releases.schedule', args),
      unschedule: (args: unknown) => run('releases.unschedule', args),
      archive: (args: unknown) => run('releases.archive', args),
      delete: (args: unknown) => run('releases.delete', args),
      get: (args: unknown) => run('releases.get', args, release),
    },
    createVersion: (args: unknown) => run('createVersion', args),
    discardVersion: (args: unknown) => run('discardVersion', args),
    getDocument: (id: string) => run('getDocument', id, id.startsWith('drafts.') ? draft : version),
    createOrReplace: (document: unknown) => run('createOrReplace', document),
  }
  return {client: client as unknown as SanityClient, calls, names: () => calls.map(([name]) => name)}
}

describe('schedulePost', () => {
  it('makes a single-document release, copies the draft into it, then schedules it', async () => {
    const {client, calls} = fakeClient()
    const result = await schedulePost(client, {documentId: 'post1', publishAt: new Date(FRIDAY)})
    expect(result).toEqual({releaseId: 'rNEW'})
    expect(calls).toEqual([
      [
        'releases.create',
        {
          metadata: {
            title: 'Scheduled publish',
            releaseType: 'scheduled',
            cardinality: 'one',
            intendedPublishAt: FRIDAY,
          },
        },
      ],
      ['createVersion', {publishedId: 'post1', baseId: 'drafts.post1', releaseId: 'rNEW'}],
      ['releases.schedule', {releaseId: 'rNEW', publishAt: FRIDAY}],
    ])
  })

  it('writes the details to the draft first, so the copy carries them', async () => {
    const {client, calls, names} = fakeClient()
    await schedulePost(client, {
      documentId: 'post1',
      publishAt: new Date(FRIDAY),
      details: {publishedAt: FRIDAY},
    })
    expect(calls[1]).toEqual(['patch', {id: 'drafts.post1', set: {publishedAt: FRIDAY}}])
    expect(names()).toEqual(['getDocument', 'patch', 'releases.create', 'createVersion', 'releases.schedule'])
  })

  it('removes what it made when Sanity turns the schedule down', async () => {
    const rejected = Object.assign(new Error('no'), {statusCode: 409})
    const {client, names} = fakeClient({fail: {'releases.schedule': rejected}})
    await expect(schedulePost(client, {documentId: 'post1', publishAt: new Date(FRIDAY)})).rejects.toBe(rejected)
    expect(names().slice(3)).toEqual(['discardVersion', 'releases.archive', 'releases.delete'])
  })

  it('touches nothing when it can’t tell whether the schedule landed', async () => {
    const lost = new Error('network')
    const {client, names} = fakeClient({fail: {'releases.schedule': lost}})
    await expect(schedulePost(client, {documentId: 'post1', publishAt: new Date(FRIDAY)})).rejects.toBe(lost)
    expect(names()).toEqual(['releases.create', 'createVersion', 'releases.schedule'])
  })

  describe('when it fails with details written', () => {
    const rejected = Object.assign(new Error('no'), {statusCode: 403})
    const lost = new Error('network')
    const slug = {_type: 'slug', current: 'quiet-mornings'}
    const input = {
      documentId: 'post1',
      publishAt: new Date(FRIDAY),
      details: {publishedAt: FRIDAY, slug},
    }
    const putBack = ['patch', {id: 'drafts.post1', set: {slug: {_type: 'slug', current: 'old'}}, unset: ['publishedAt']}]

    for (const step of ['releases.create', 'createVersion', 'releases.schedule']) {
      it(`puts the draft’s details back when Sanity turns down ${step}`, async () => {
        const draft = {_id: 'drafts.post1', slug: {_type: 'slug', current: 'old'}}
        const {client, calls} = fakeClient({draft, fail: {[step]: rejected}})
        await expect(schedulePost(client, input)).rejects.toBe(rejected)
        expect(calls.at(-1)).toEqual(putBack)
      })
    }

    it('takes away a date the draft never had', async () => {
      const {client, calls} = fakeClient({draft: {_id: 'drafts.post1'}, fail: {'releases.create': rejected}})
      await expect(schedulePost(client, input)).rejects.toBe(rejected)
      expect(calls.at(-1)).toEqual(['patch', {id: 'drafts.post1', set: {}, unset: ['publishedAt', 'slug']}])
    })

    it('leaves the details when the schedule may have landed: Unlock clears them', async () => {
      const {client, names} = fakeClient({fail: {'releases.schedule': lost}})
      await expect(schedulePost(client, input)).rejects.toBe(lost)
      expect(names().at(-1)).toBe('releases.schedule')
    })
  })

  describe('when the copy is lost on the way', () => {
    const lost = new Error('network')
    const input = {documentId: 'post1', publishAt: new Date(FRIDAY)}

    it('removes the empty release, which the room would never see', async () => {
      const {client, calls, names} = fakeClient({version: null, fail: {createVersion: lost}})
      await expect(schedulePost(client, input)).rejects.toBe(lost)
      expect(calls[2]).toEqual(['getDocument', 'versions.rNEW.post1'])
      expect(names().slice(3)).toEqual(['discardVersion', 'releases.archive', 'releases.delete'])
    })

    it('keeps the release when the copy landed after all: the room shows it and offers Unlock', async () => {
      const {client, names} = fakeClient({version: {_id: 'versions.rNEW.post1'}, fail: {createVersion: lost}})
      await expect(schedulePost(client, input)).rejects.toBe(lost)
      expect(names()).toEqual(['releases.create', 'createVersion', 'getDocument'])
    })

    it('keeps the release when it can’t tell', async () => {
      const {client, names} = fakeClient({fail: {createVersion: lost, getDocument: lost}})
      await expect(schedulePost(client, input)).rejects.toBe(lost)
      expect(names()).toEqual(['releases.create', 'createVersion', 'getDocument'])
    })
  })
})

describe('unlockPost', () => {
  const scheduled = {state: 'scheduled', publishAt: FRIDAY, metadata: {intendedPublishAt: FRIDAY}}
  const version = {_id: 'versions.rABC.post1', _type: 'post', _rev: 'r1', title: 'Quiet mornings', publishedAt: FRIDAY}
  const args = {documentId: 'post1', releaseId: 'rABC', dateField: 'publishedAt'}

  it('unschedules, makes the Scheduled version the draft, then dismisses it and its release', async () => {
    const {client, calls, names} = fakeClient({release: scheduled, version})
    const result = await unlockPost(client, args)
    expect(result).toEqual({scheduledFor: FRIDAY})
    expect(names()).toEqual([
      'releases.get',
      'releases.unschedule',
      'getDocument',
      'createOrReplace',
      'discardVersion',
      'releases.archive',
      'releases.delete',
    ])
    expect(calls[2]).toEqual(['getDocument', 'versions.rABC.post1'])
    // The date was the room's, stamped for a schedule that is now gone.
    expect(calls[3]).toEqual(['createOrReplace', {_id: 'drafts.post1', _type: 'post', title: 'Quiet mornings'}])
  })

  it('doesn’t unschedule a Stale version: it already is', async () => {
    const {client, names} = fakeClient({release: {...scheduled, state: 'active', publishAt: undefined}, version})
    const result = await unlockPost(client, args)
    expect(result).toEqual({scheduledFor: FRIDAY})
    expect(names()).not.toContain('releases.unschedule')
    expect(names()).toContain('createOrReplace')
  })

  it('leaves the draft alone when the version is already gone', async () => {
    const {client, names} = fakeClient({release: {...scheduled, state: 'active'}, version: null})
    await unlockPost(client, args)
    expect(names()).toEqual(['releases.get', 'getDocument', 'releases.archive', 'releases.delete'])
  })

  it('finishes an Unlock that was cut short after archiving', async () => {
    const {client, names} = fakeClient({release: {...scheduled, state: 'archived'}})
    await unlockPost(client, args)
    expect(names()).toEqual(['releases.get', 'releases.delete'])
  })

  it('has nothing to do when the release is gone', async () => {
    const {client, names} = fakeClient({release: undefined})
    expect(await unlockPost(client, args)).toEqual({scheduledFor: undefined})
    expect(names()).toEqual(['releases.get'])
  })

  it('never dismisses the version before the draft has it', async () => {
    const {client, names} = fakeClient({release: scheduled, version, fail: {createOrReplace: new Error('no')}})
    await expect(unlockPost(client, args)).rejects.toThrow('no')
    expect(names()).not.toContain('discardVersion')
    expect(names()).not.toContain('releases.archive')
  })
})
