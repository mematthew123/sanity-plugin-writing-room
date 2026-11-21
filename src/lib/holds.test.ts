import {GUARD_DOC_TYPE} from '@sanity/workflows'
import {type SanityClient} from 'sanity'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {checkHold, type Evaluator, GUARD_TYPE, holdSentence, mutationFor, scheduledButHeld} from './holds'

// Holds as the engine stores them, weighed by the engine's own check: nothing here stands in for it.
const guard = (over: Record<string, unknown> = {}) => ({
  _id: 'temp.system.guard.dev.wf-instance.i1.hold-publishing',
  _type: GUARD_DOC_TYPE,
  resourceType: 'dataset',
  resourceId: 'proj.production',
  owner: 'workflow-engine',
  sourceInstanceId: 'dev.wf-instance.i1',
  sourceDefinition: 'post-review',
  sourceStage: 'review',
  match: {idRefs: ['a', 'drafts.a'], actions: ['publish']},
  predicate: '',
  metadata: {},
  ...over,
})

const DRAFT = {_id: 'drafts.a', _type: 'post', title: 'Tides'}
const PUBLISHED = {_id: 'a', _type: 'post', title: 'Tides, before'}
const SCHEDULED = {_id: 'versions.r1.a', _type: 'post', title: 'Tides, on Friday'}

function fakeClient({
  guards = [],
  draft = DRAFT,
  published = null,
  failFetch = false,
}: {
  guards?: unknown[]
  draft?: Record<string, unknown> | null
  published?: Record<string, unknown> | null
  failFetch?: boolean
} = {}) {
  const fetch = vi.fn(async (_query: string, _params: Record<string, unknown>) => {
    if (failFetch) throw Object.assign(new Error('Forbidden'), {statusCode: 403})
    return guards
  })
  const getDocument = vi.fn(async (id: string) =>
    id === 'drafts.a' ? draft : id === 'a' ? published : id === 'versions.r1.a' ? SCHEDULED : null,
  )
  const client = {
    fetch,
    getDocument,
    config: () => ({projectId: 'proj', dataset: 'production'}),
  } as unknown as SanityClient
  return {client, fetch, getDocument}
}

const ask = (client: SanityClient, action: 'publish' | 'discard' = 'publish', identity = 'u1') =>
  checkHold(client, {action, documentId: 'a', documentType: 'post', identity})

afterEach(() => vi.restoreAllMocks())

describe('the guard type', () => {
  it('is the one the engine writes', () => {
    expect(GUARD_TYPE).toBe(GUARD_DOC_TYPE)
  })
})

describe('checkHold', () => {
  it('is clear, and loads nothing, when no workflow holds the document', async () => {
    const {client, getDocument} = fakeClient()
    const load = vi.fn<() => Promise<Evaluator>>()
    expect(await checkHold(client, {action: 'publish', documentId: 'a', documentType: 'post'}, load)).toEqual({kind: 'clear'})
    expect(load).not.toHaveBeenCalled()
    expect(getDocument).not.toHaveBeenCalled()
  })

  it('asks only for holds that could be about this document', async () => {
    const {client, fetch} = fakeClient()
    await ask(client)
    expect(fetch.mock.calls[0]?.[1]).toEqual({type: GUARD_TYPE, id: 'a', draftId: 'drafts.a', documentType: 'post'})
  })

  it('holds a first publish', async () => {
    const {client} = fakeClient({guards: [guard()]})
    expect(await ask(client)).toEqual({kind: 'held'})
  })

  it('holds publishing changes to a published document', async () => {
    const {client} = fakeClient({guards: [guard()], published: PUBLISHED})
    expect(await ask(client)).toEqual({kind: 'held'})
  })

  it('passes on what the workflow’s author said about the hold', async () => {
    const {client} = fakeClient({guards: [guard({description: ' Waiting on legal '})]})
    expect(await ask(client)).toEqual({kind: 'held', reason: 'Waiting on legal'})
  })

  it('leaves another document’s hold alone', async () => {
    const {client} = fakeClient({guards: [guard({match: {idPatterns: ['b*'], actions: ['publish']}})]})
    expect(await ask(client)).toEqual({kind: 'clear'})
  })

  it('leaves a hold from another dataset alone', async () => {
    const {client} = fakeClient({guards: [guard({resourceId: 'proj.staging'})]})
    expect(await ask(client)).toEqual({kind: 'clear'})
  })

  it('weighs a hold’s rule for the person asking', async () => {
    const {client} = fakeClient({guards: [guard({predicate: 'identity() == "u1"'})]})
    expect(await ask(client, 'publish', 'u1')).toEqual({kind: 'clear'})
    expect(await ask(client, 'publish', 'u2')).toEqual({kind: 'held'})
  })

  it('doesn’t take a publish hold as a reason not to discard', async () => {
    const {client} = fakeClient({guards: [guard()]})
    expect(await ask(client, 'discard')).toEqual({kind: 'clear'})
  })

  it('holds discarding under a delete hold', async () => {
    const {client} = fakeClient({guards: [guard({match: {idRefs: ['a', 'drafts.a'], actions: ['delete']}})]})
    expect(await ask(client, 'discard')).toEqual({kind: 'held'})
    expect(await ask(client, 'publish')).toEqual({kind: 'clear'})
  })

  it('has nothing to hold when there is no draft to publish', async () => {
    const {client} = fakeClient({guards: [guard()], draft: null, published: PUBLISHED})
    expect(await ask(client)).toEqual({kind: 'clear'})
  })

  it('weighs a scheduled publish from the scheduled copy, the draft having gone', async () => {
    const {client} = fakeClient({guards: [guard()], draft: null})
    expect(await checkHold(client, {action: 'publish', documentId: 'a', documentType: 'post', from: 'versions.r1.a'})).toEqual({
      kind: 'held',
    })
  })

  describe('when it can’t tell', () => {
    it('goes ahead if the holds can’t be read at all', async () => {
      const warned = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const {client} = fakeClient({failFetch: true})
      expect(await ask(client)).toEqual({kind: 'clear'})
      expect(warned).toHaveBeenCalledOnce()
    })

    it('refuses if a hold is there in a shape it doesn’t know', async () => {
      const warned = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const {client} = fakeClient({guards: [guard({match: {idRefs: 'a'}})]})
      expect(await ask(client)).toEqual({kind: 'unreadable'})
      expect(warned).toHaveBeenCalledOnce()
    })

    it('refuses if the engine can’t be loaded', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const {client} = fakeClient({guards: [guard()]})
      const verdict = await checkHold(client, {action: 'publish', documentId: 'a', documentType: 'post'}, () =>
        Promise.reject(new Error('chunk failed to load')),
      )
      expect(verdict).toEqual({kind: 'unreadable'})
    })

    it('refuses if the document can’t be read', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const {client, getDocument} = fakeClient({guards: [guard()]})
      getDocument.mockRejectedValue(new Error('offline'))
      expect(await ask(client)).toEqual({kind: 'unreadable'})
    })
  })
})

describe('mutationFor', () => {
  it('describes a publish as the draft taking the published document’s place', () => {
    expect(mutationFor('publish', 'a', {draft: DRAFT, published: PUBLISHED})).toEqual({
      before: PUBLISHED,
      after: {...DRAFT, _id: 'a'},
      action: 'update',
    })
    expect(mutationFor('publish', 'a', {draft: DRAFT, published: null})?.action).toBe('create')
  })

  it('describes a discard as the draft going', () => {
    expect(mutationFor('discard', 'a', {draft: DRAFT, published: null})).toEqual({
      before: DRAFT,
      after: null,
      action: 'delete',
    })
  })
})

describe('holdSentence', () => {
  it('says nothing when nothing holds', () => {
    expect(holdSentence({kind: 'clear'}, 'Post', 'publish')).toBeNull()
  })

  it('says what happened, then what would change it', () => {
    expect(holdSentence({kind: 'held'}, 'Post', 'publish')).toBe(
      'A workflow is holding this Post. It can be published once the workflow allows it.',
    )
    expect(holdSentence({kind: 'held'}, 'Post', 'discard')).toBe(
      'A workflow is holding this Post, so it can’t be discarded yet.',
    )
  })

  it('adds the author’s own words as a sentence', () => {
    expect(holdSentence({kind: 'held', reason: 'Waiting on legal'}, 'Post', 'publish')).toBe(
      'A workflow is holding this Post. It can be published once the workflow allows it. Waiting on legal.',
    )
    expect(holdSentence({kind: 'held', reason: 'Ask Sam first!'}, 'Post', 'publish')).toMatch(/Ask Sam first!$/)
  })

  it('says a scheduled document will go live all the same, and how to stop it', () => {
    expect(scheduledButHeld('Post')).toBe(
      'A workflow is holding this Post, but it will still go live when scheduled. Unlock it to stop that.',
    )
  })

  it('offers Structure when the workflow couldn’t be checked', () => {
    expect(holdSentence({kind: 'unreadable'}, 'Post', 'publish')).toMatch(/publish it from Structure\.$/)
    expect(holdSentence({kind: 'unreadable'}, 'Post', 'discard')).toMatch(/Try again in a moment\.$/)
  })
})
