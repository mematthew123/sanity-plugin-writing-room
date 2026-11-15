import {type SanityClient} from 'sanity'
import {describe, expect, it} from 'vitest'
import {schedulePost, unlockPost} from './schedule-actions'

const FRIDAY = '2026-11-20T09:00:00.000Z'

interface Fake {
  release?: Record<string, unknown>
  releaseLater?: Array<Record<string, unknown> | undefined>
  versionLater?: Record<string, unknown> | null
  version?: Record<string, unknown> | null
  draft?: Record<string, unknown> | null
  draftLater?: Record<string, unknown> | null
  fail?: Record<string, unknown>
}

function fakeClient({
  release,
  releaseLater,
  version = null,
  versionLater,
  draft = null,
  draftLater,
  fail = {},
}: Fake = {}) {
  let gets = 0
  let versionReads = 0
  let draftReads = 0
  const calls: Array<[string, unknown?]> = []
  const run = async <T,>(name: string, args: unknown, result?: T): Promise<T> => {
    calls.push([name, args])
    if (name in fail) throw fail[name]
    return result as T
  }
  const client = {
    patch: (id: string) => {
      const patch: Record<string, unknown> = {id}
      const builder = {
        set: (set: unknown) => ((patch.set = set), builder),
        unset: (unset: unknown) => ((patch.unset = unset), builder),
        ifRevisionId: (rev: string) => ((patch.ifRevisionId = rev), builder),
        commit: () => run('patch', patch, {_id: id, _rev: 'rWRITTEN'}),
      }
      return builder
    },
    releases: {
      create: (args: unknown) => run('releases.create', args, {releaseId: 'rNEW'}),
      schedule: (args: unknown) => run('releases.schedule', args),
      unschedule: (args: unknown) => run('releases.unschedule', args),
      archive: (args: unknown) => run('releases.archive', args),
      delete: (args: unknown) => run('releases.delete', args),
      get: (args: unknown) => {
        const later = releaseLater && gets > 0 ? releaseLater[Math.min(gets, releaseLater.length) - 1] : release
        gets += 1
        return run('releases.get', args, later)
      },
    },
    createVersion: (args: unknown) => run('createVersion', args),
    discardVersion: (args: unknown) => run('discardVersion', args),
    getDocument: (id: string) => {
      if (id.startsWith('drafts.')) {
        const read = draftLater !== undefined && draftReads > 0 ? draftLater : draft
        draftReads += 1
        return run('getDocument', id, read)
      }
      const read = versionLater !== undefined && versionReads > 0 ? versionLater : version
      versionReads += 1
      return run('getDocument', id, read)
    },
    transaction: () => {
      const operations: unknown[] = []
      const transaction = {
        patch: (id: string, patch: object) => (operations.push({patch: {id, ...patch}}), transaction),
        createOrReplace: (document: unknown) => (operations.push({createOrReplace: document}), transaction),
        delete: (id: string) => (operations.push({delete: id}), transaction),
        commit: () => run('transaction', operations),
      }
      return transaction
    },
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

  it('schedules the revision that was checked, and nothing newer', async () => {
    const {client, calls} = fakeClient()
    await schedulePost(client, {documentId: 'post1', publishAt: new Date(FRIDAY), revision: 'rCHECKED'})
    expect(calls[1]).toEqual([
      'createVersion',
      {publishedId: 'post1', baseId: 'drafts.post1', releaseId: 'rNEW', ifBaseRevisionId: 'rCHECKED'},
    ])
  })

  it('writes the details to the checked revision only, then copies the revision that made', async () => {
    const {client, calls} = fakeClient()
    await schedulePost(client, {
      documentId: 'post1',
      publishAt: new Date(FRIDAY),
      details: {publishedAt: FRIDAY},
      revision: 'rCHECKED',
    })
    expect(calls[1]).toEqual(['patch', {id: 'drafts.post1', set: {publishedAt: FRIDAY}, ifRevisionId: 'rCHECKED'}])
    expect(calls[3]).toEqual([
      'createVersion',
      {publishedId: 'post1', baseId: 'drafts.post1', releaseId: 'rNEW', ifBaseRevisionId: 'rWRITTEN'},
    ])
  })

  it('makes nothing when the draft has moved on from the checked revision', async () => {
    const moved = Object.assign(new Error('moved on'), {statusCode: 409})
    const {client, names} = fakeClient({fail: {patch: moved}})
    await expect(
      schedulePost(client, {
        documentId: 'post1',
        publishAt: new Date(FRIDAY),
        details: {publishedAt: FRIDAY},
        revision: 'rCHECKED',
      }),
    ).rejects.toBe(moved)
    expect(names()).toEqual(['getDocument', 'patch'])
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
    const old = {_type: 'slug', current: 'old'}
    const written = {_id: 'drafts.post1', _rev: 'rWRITTEN', publishedAt: FRIDAY, slug: {...slug}}
    const putBack = ['patch', {id: 'drafts.post1', set: {slug: old}, unset: ['publishedAt'], ifRevisionId: 'rWRITTEN'}]

    for (const step of ['releases.create', 'createVersion', 'releases.schedule']) {
      it(`puts the draft’s details back when Sanity turns down ${step}`, async () => {
        const draft = {_id: 'drafts.post1', slug: old}
        const {client, calls} = fakeClient({draft, draftLater: written, fail: {[step]: rejected}})
        await expect(schedulePost(client, input)).rejects.toBe(rejected)
        expect(calls.at(-1)).toEqual(putBack)
      })
    }

    it('takes away a date the draft never had', async () => {
      const {client, calls} = fakeClient({
        draft: {_id: 'drafts.post1'},
        draftLater: written,
        fail: {'releases.create': rejected},
      })
      await expect(schedulePost(client, input)).rejects.toBe(rejected)
      expect(calls.at(-1)).toEqual([
        'patch',
        {id: 'drafts.post1', set: {}, unset: ['publishedAt', 'slug'], ifRevisionId: 'rWRITTEN'},
      ])
    })

    it('leaves a detail someone else has changed since', async () => {
      const theirs = {...written, _rev: 'rTHEIRS', slug: {_type: 'slug', current: 'their-slug'}}
      const {client, calls} = fakeClient({
        draft: {_id: 'drafts.post1', slug: old},
        draftLater: theirs,
        fail: {'releases.create': rejected},
      })
      await expect(schedulePost(client, input)).rejects.toBe(rejected)
      expect(calls.at(-1)).toEqual([
        'patch',
        {id: 'drafts.post1', set: {}, unset: ['publishedAt'], ifRevisionId: 'rTHEIRS'},
      ])
    })

    it('writes nothing back when every detail has been changed since', async () => {
      const theirs = {_id: 'drafts.post1', _rev: 'rTHEIRS', publishedAt: '2026-01-01T00:00:00.000Z', slug: old}
      const {client, names} = fakeClient({
        draft: {_id: 'drafts.post1', slug: old},
        draftLater: theirs,
        fail: {'releases.create': rejected},
      })
      await expect(schedulePost(client, input)).rejects.toBe(rejected)
      expect(names().filter((name) => name === 'patch')).toHaveLength(1)
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
      'transaction',
      'releases.archive',
      'releases.delete',
    ])
    expect(calls[2]).toEqual(['getDocument', 'versions.rABC.post1'])
    expect(calls[3]).toEqual([
      'transaction',
      [
        {patch: {id: 'versions.rABC.post1', ifRevisionID: 'r1', unset: ['writingRoomUnlock']}},
        {createOrReplace: {_id: 'drafts.post1', _type: 'post', title: 'Quiet mornings'}},
        {delete: 'versions.rABC.post1'},
      ],
    ])
  })

  it('doesn’t unschedule a Stale version: it already is', async () => {
    const {client, names} = fakeClient({release: {...scheduled, state: 'active', publishAt: undefined}, version})
    const result = await unlockPost(client, args)
    expect(result).toEqual({scheduledFor: FRIDAY})
    expect(names()).not.toContain('releases.unschedule')
    expect(names()).toContain('transaction')
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

  it('never archives the release while the version is still the only copy', async () => {
    const {client, names} = fakeClient({release: scheduled, version, fail: {transaction: new Error('no')}})
    await expect(unlockPost(client, args)).rejects.toThrow('no')
    expect(names()).not.toContain('releases.archive')
    expect(names()).not.toContain('releases.delete')
  })

  describe('alongside another Unlock', () => {
    const rejected = Object.assign(new Error('already'), {statusCode: 409})

    it('carries on when the other one unscheduled first', async () => {
      const {client, names} = fakeClient({
        release: scheduled,
        releaseLater: [{...scheduled, state: 'active'}],
        version,
        fail: {'releases.unschedule': rejected},
      })
      await expect(unlockPost(client, args)).resolves.toEqual({scheduledFor: FRIDAY})
      expect(names()).toContain('transaction')
    })

    it('still fails when the release really couldn’t be unscheduled', async () => {
      const {client, names} = fakeClient({release: scheduled, version, fail: {'releases.unschedule': rejected}})
      await expect(unlockPost(client, args)).rejects.toBe(rejected)
      expect(names()).not.toContain('transaction')
    })

    it('carries on when the other one has already given the draft the version', async () => {
      const {client, names} = fakeClient({release: scheduled, version, versionLater: null, fail: {transaction: rejected}})
      await expect(unlockPost(client, args)).resolves.toEqual({scheduledFor: FRIDAY})
      expect(names().slice(-2)).toEqual(['releases.archive', 'releases.delete'])
    })

    it('is done when the other one archived and deleted the release', async () => {
      const {client} = fakeClient({
        release: {...scheduled, state: 'active'},
        releaseLater: [undefined],
        fail: {'releases.archive': rejected, 'releases.delete': rejected},
      })
      await expect(unlockPost(client, args)).resolves.toEqual({scheduledFor: FRIDAY})
    })

    it('doesn’t take a lost request for one that was turned down', async () => {
      const lost = new Error('network')
      const {client} = fakeClient({
        release: scheduled,
        releaseLater: [{...scheduled, state: 'active'}],
        version,
        fail: {'releases.unschedule': lost},
      })
      await expect(unlockPost(client, args)).rejects.toBe(lost)
    })
  })
})
