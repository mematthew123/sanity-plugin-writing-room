import {describe, expect, it, vi} from 'vitest'
import {namedInLine, readAnswers, type SortingAnswer} from './answers'
import {LIMITS, parseSortingRequest, type SortingPickField, type SortingRequest} from './contract'
import {createSortingRoute, type SortingDecide} from './handler'
import {buildDecision, NONE, questionId} from './questions'

const tags: SortingPickField = {
  kind: 'pick',
  name: 'tags',
  title: 'Tags',
  many: true,
  options: [
    {id: 'portugal', label: 'portugal'},
    {id: 'city-breaks', label: 'City breaks'},
    {id: 'food', label: 'food'},
  ],
}

/** The Lisbon piece from fixtures/sorting, as the room would send it. */
const lisbon: SortingRequest = {
  version: 1,
  blocks: [
    {id: 'k-head', edge: 'top', text: 'A Week in Lisbon'},
    {id: 'k-by', edge: 'top', text: 'By Sam Okafor'},
    {id: 'k-stand', edge: 'top', text: 'Seven days, four neighbourhoods and one very steep tram.'},
    {id: 'k-tags', edge: 'top', text: 'Tags: portugal, city breaks'},
    {id: 'k-first', edge: 'top', text: 'I arrived in Lisbon on a Sunday evening with a bag that was too heavy.'},
    {id: 'k-note', edge: 'bottom', text: 'Sam Okafor writes about slow travel. He lives in Leeds.'},
  ],
  opening: 'Lisbon is a city that punishes hurry. The hills see to that.',
  fields: [
    {kind: 'text', name: 'excerpt', title: 'Excerpt', description: 'A one-line summary shown in lists.'},
    {
      kind: 'pick',
      name: 'author',
      title: 'Author',
      many: false,
      options: [
        {id: 'author-ana', label: 'Ana Reis'},
        {id: 'author-sam', label: 'Sam Okafor'},
      ],
    },
    tags,
    {
      kind: 'pick',
      name: 'categories',
      title: 'Categories',
      many: true,
      options: [
        {id: 'cat-travel', label: 'Travel'},
        {id: 'cat-finance', label: 'Finance'},
      ],
    },
  ],
}

const choice = (name: string, sure = 0.95): SortingAnswer => ({type: 'choice', choice: name, probabilities: {[name]: sure}})
const yes = (probability: number): SortingAnswer => ({type: 'boolean', probability})

/** What a model that reads the Lisbon piece well would answer. */
const good: Record<string, SortingAnswer> = {
  [questionId.headline]: choice('b1'),
  [questionId.place(0)]: choice('b3'),
  [questionId.line(1)]: choice('b2'),
  [questionId.pick(1)]: choice('o2'),
  [questionId.stated(1)]: yes(0.97),
  [questionId.line(2)]: choice('b4'),
  [questionId.applies(2, 0)]: yes(0.6),
  [questionId.line(3)]: choice(NONE),
  [questionId.applies(3, 0)]: yes(0.96),
  [questionId.applies(3, 1)]: yes(0.02),
}

describe('the questions', () => {
  const {state, questions} = buildDecision(lisbon)

  it('puts the blocks in the state by edge, under names of their own', () => {
    expect(Object.keys(state.top)).toEqual(['b1', 'b2', 'b3', 'b4', 'b5'])
    expect(state.bottom).toEqual({b6: 'Sam Okafor writes about slow travel. He lives in Leeds.'})
    expect(JSON.stringify({state, questions})).not.toContain('k-head')
    expect(JSON.stringify({state, questions})).not.toContain('author-sam')
  })

  it('offers only top blocks as the headline, and always a way to say none', () => {
    const headline = questions[questionId.headline]
    expect(headline.type === 'choice' && Object.keys(headline.criteria)).toEqual(['b1', 'b2', 'b3', 'b4', 'b5', NONE])
    for (const question of Object.values(questions)) {
      if (question.type === 'choice') expect(question.criteria).toHaveProperty(NONE)
    }
  })

  it('asks what each kind of field needs', () => {
    expect(Object.keys(questions).sort()).toEqual(
      [
        questionId.headline,
        questionId.place(0),
        questionId.line(1),
        questionId.pick(1),
        questionId.stated(1),
        questionId.line(2),
        questionId.applies(2, 0),
        questionId.applies(2, 1),
        questionId.applies(2, 2),
        questionId.line(3),
        questionId.applies(3, 0),
        questionId.applies(3, 1),
      ].sort(),
    )
    const place = questions[questionId.place(0)]
    expect(place.instructions).toContain('A one-line summary shown in lists.')
  })
})

describe('reading the answers', () => {
  it('sorts the whole piece', () => {
    expect(readAnswers(lisbon, good)).toEqual({
      version: 1,
      headline: {block: 'k-head', confidence: 0.95},
      placed: [{field: 'excerpt', block: 'k-stand', confidence: 0.95}],
      picked: [
        {field: 'author', options: ['author-sam'], kind: 'stated', line: 'k-by', confidence: 0.95},
        {field: 'tags', options: ['portugal', 'city-breaks'], kind: 'stated', line: 'k-tags', confidence: 0.95},
        {field: 'categories', options: ['cat-travel'], kind: 'judged', line: null, confidence: 0.96},
      ],
    })
  })

  it('leaves a field empty under its floor', () => {
    const unsure = {...good, [questionId.place(0)]: choice('b3', 0.6), [questionId.applies(3, 0)]: yes(0.85)}
    const response = readAnswers(lisbon, unsure)
    expect(response.placed).toEqual([])
    expect(response.picked.map((pick) => pick.field)).toEqual(['author', 'tags'])
  })

  it('counts an answer with no probability for nothing', () => {
    const bare = {...good, [questionId.headline]: {type: 'choice', choice: 'b1'} as SortingAnswer}
    expect(readAnswers(lisbon, bare).headline).toBeNull()
    expect(readAnswers(lisbon, bare, {confidence: {[questionId.headline]: 0.9}}).headline?.block).toBe('k-head')
  })

  it('keeps the byline in the body when no author was picked', () => {
    const unknown = {...good, [questionId.pick(1)]: choice(NONE)}
    expect(readAnswers(lisbon, unknown).picked.find((pick) => pick.field === 'author')).toBeUndefined()
  })

  it('picks the author from a note at the foot and keeps the note', () => {
    const fromNote = {...good, [questionId.line(1)]: choice(NONE)}
    expect(readAnswers(lisbon, fromNote).picked[0]).toEqual({
      field: 'author',
      options: ['author-sam'],
      kind: 'stated',
      line: null,
      confidence: 0.95,
    })
  })

  it('holds a judged pick to the higher floor', () => {
    const judged = {...good, [questionId.line(1)]: choice(NONE), [questionId.stated(1)]: yes(0.1), [questionId.pick(1)]: choice('o2', 0.85)}
    expect(readAnswers(lisbon, judged).picked.find((pick) => pick.field === 'author')).toBeUndefined()
  })

  it('keeps a tags line that names a tag the field does not offer', () => {
    const request = structuredClone(lisbon)
    request.blocks[3].text = 'Tags: portugal, trams'
    const pick = readAnswers(request, good).picked.find((entry) => entry.field === 'tags')
    expect(pick).toMatchObject({options: ['portugal'], kind: 'stated', line: null})
  })

  it('gives a block to one place only: the surest claim', () => {
    const both = {...good, [questionId.place(0)]: choice('b1', 0.9)}
    const response = readAnswers(lisbon, both)
    expect(response.headline?.block).toBe('k-head')
    expect(response.placed).toEqual([])
  })

  it('reads a label line against the options', () => {
    expect(namedInLine('Tags: Portugal; #city breaks', tags)).toEqual({options: ['portugal', 'city-breaks'], whole: true})
    expect(namedInLine('Tags: portugal, trams', tags)).toEqual({options: ['portugal'], whole: false})
    expect(namedInLine('portugal, food', tags)).toEqual({options: [], whole: false})
  })
})

describe('checking a request', () => {
  it('accepts the Lisbon request as it is', () => {
    expect(parseSortingRequest(structuredClone(lisbon))).toEqual({request: lisbon})
  })

  it('trims text to the limits', () => {
    const long = structuredClone(lisbon)
    long.blocks[4].text = 'x'.repeat(LIMITS.blockText + 50)
    long.opening = 'y'.repeat(LIMITS.opening + 50)
    const parsed = parseSortingRequest(long)
    expect('request' in parsed && parsed.request.blocks[4].text.length).toBe(LIMITS.blockText)
    expect('request' in parsed && parsed.request.opening.length).toBe(LIMITS.opening)
  })

  it.each([
    ['another version', {...lisbon, version: 2}],
    ['no blocks', {...lisbon, blocks: []}],
    ['too many blocks', {...lisbon, blocks: Array.from({length: LIMITS.blocks + 1}, (_, i) => ({id: `k${i}`, text: 'x', edge: 'top'}))}],
    ['an empty block', {...lisbon, blocks: [{id: 'k', text: '  ', edge: 'top'}]}],
    ['a block twice', {...lisbon, blocks: [lisbon.blocks[0], lisbon.blocks[0]]}],
    ['a pick with no options', {...lisbon, fields: [{...tags, options: []}]}],
    ['too many options', {...lisbon, fields: [{...tags, options: Array.from({length: LIMITS.options + 1}, (_, i) => ({id: `${i}`, label: `${i}`}))}]}],
    ['an unknown kind', {...lisbon, fields: [{name: 'x', title: 'X', kind: 'boolean'}]}],
    ['not an object', 'sort this'],
  ])('refuses %s', (_, body) => {
    expect(parseSortingRequest(body)).toHaveProperty('problem')
  })
})

describe('the route', () => {
  const member = vi.fn<typeof fetch>(async () => Response.json({id: 'p123', roles: [{name: 'editor'}]}))
  const decide = vi.fn<SortingDecide>(async () => ({answers: good}))
  const route = (overrides: Partial<Parameters<typeof createSortingRoute>[0]> = {}) =>
    createSortingRoute({projectId: 'abc123', decide, fetch: member, ...overrides})
  const post = (body: unknown = lisbon, headers: Record<string, string> = {authorization: 'Bearer writer-token'}) =>
    new Request('https://site.example/api/sort', {
      method: 'POST',
      headers,
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })

  it('sorts for a member of the project', async () => {
    const response = await route()(post())
    expect(response.status).toBe(200)
    expect((await response.json()).headline).toEqual({block: 'k-head', confidence: 0.95})
    expect(member.mock.lastCall?.[0]).toBe('https://abc123.api.sanity.io/v2026-11-01/users/me')
    expect(new Headers(member.mock.lastCall?.[1]?.headers).get('authorization')).toBe('Bearer writer-token')
  })

  it('turns away a caller with no token before doing anything', async () => {
    member.mockClear()
    decide.mockClear()
    expect((await route()(post(lisbon, {}))).status).toBe(401)
    expect(member).not.toHaveBeenCalled()
    expect(decide).not.toHaveBeenCalled()
  })

  it.each([
    ['a token Sanity rejects', async () => new Response('{}', {status: 401})],
    ['a token with no place in the project', async () => Response.json({})],
    ['someone with no role', async () => Response.json({id: 'p1', roles: []})],
  ])('turns away %s without asking the model', async (_, answer) => {
    decide.mockClear()
    expect((await route({fetch: answer})(post())).status).toBe(403)
    expect(decide).not.toHaveBeenCalled()
  })

  it('refuses a request it cannot read', async () => {
    expect((await route()(post('not json'))).status).toBe(400)
    const invalid = await route()(post({...lisbon, blocks: []}))
    expect(invalid.status).toBe(400)
    expect(await invalid.json()).toEqual({error: 'invalid', problem: 'There are no blocks to sort.'})
    expect((await route()(post('x'.repeat(LIMITS.body + 1)))).status).toBe(413)
  })

  it('says only that it is unavailable when the model or Sanity fails', async () => {
    const failing = route({decide: async () => Promise.reject(new Error('gateway said: secret detail'))})
    const response = await failing(post())
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({error: 'unavailable'})
    const offline = route({fetch: async () => Promise.reject(new Error('offline'))})
    expect((await offline(post())).status).toBe(502)
  })

  it('answers only POST', async () => {
    expect((await route()(new Request('https://site.example/api/sort'))).status).toBe(405)
  })

  it('lets a listed Studio origin through, and no other', async () => {
    const studio = 'https://room.sanity.studio'
    const handler = route({origins: [studio]})
    const preflight = await handler(new Request('https://site.example/api/sort', {method: 'OPTIONS', headers: {origin: studio}}))
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-origin')).toBe(studio)
    expect(preflight.headers.get('access-control-allow-headers')).toContain('authorization')
    const allowed = await handler(post(lisbon, {authorization: 'Bearer writer-token', origin: studio}))
    expect(allowed.headers.get('access-control-allow-origin')).toBe(studio)
    const other = await handler(post(lisbon, {authorization: 'Bearer writer-token', origin: 'https://elsewhere.example'}))
    expect(other.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('needs a project id', () => {
    expect(() => route({projectId: ''})).toThrow(/projectId/)
  })
})
