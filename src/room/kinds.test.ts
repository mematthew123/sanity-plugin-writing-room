import {createSchema, type SchemaType} from 'sanity'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {resolveConfig, resolveSortingEndpoint} from '../config'
import {schemaTypes} from '../schema'
import {pluralize, resolveKinds} from './kinds'

const compiled = createSchema({
  name: 'test',
  types: [
    ...schemaTypes,
    {
      name: 'caseStudy',
      title: 'Case Study',
      type: 'document',
      fields: [
        {name: 'title', type: 'string'},
        {name: 'body', type: 'body'},
        {name: 'slug', type: 'slug'},
      ],
    },
    {name: 'newsItem', type: 'document', fields: [{name: 'title', type: 'string'}, {name: 'body', type: 'body'}]},
    {name: 'tag', type: 'document', fields: [{name: 'title', type: 'string'}]},
  ],
})
const get = (name: string) => compiled.get(name) as SchemaType | undefined
const POST_FIELDS = {title: 'title', body: 'body', slug: 'slug', publishedAt: 'publishedAt', image: 'coverImage'}

describe('pluralize', () => {
  it.each([
    ['Post', 'Posts'],
    ['Case Study', 'Case Studies'],
    ['Essay', 'Essays'],
    ['Box', 'Boxes'],
    ['Sketch', 'Sketches'],
  ])('%s → %s', (singular, plural) => {
    expect(pluralize(singular)).toBe(plural)
  })
})

describe('resolveKinds', () => {
  afterEach(() => vi.restoreAllMocks())

  it('names each type and finds its fields, in the order given', () => {
    expect(resolveKinds(resolveConfig({types: ['post', 'caseStudy']}).types, get)).toEqual([
      {type: 'post', singular: 'Post', plural: 'Posts', fields: POST_FIELDS, imageTitle: 'Cover Image'},
      {
        type: 'caseStudy',
        singular: 'Case Study',
        plural: 'Case Studies',
        fields: {title: 'title', body: 'body', slug: 'slug', publishedAt: undefined, image: undefined},
        imageTitle: undefined,
      },
    ])
  })

  it('prefers the names given in the options', () => {
    const types = resolveConfig({types: [{type: 'newsItem', title: 'News', pluralTitle: 'News'}]}).types
    expect(resolveKinds(types, get)[0]).toMatchObject({singular: 'News', plural: 'News'})
  })

  it('falls back to the type name when the schema type has no title', () => {
    expect(resolveKinds([{type: 'newsItem'}], get)[0]?.singular).toBe('News Item')
  })

  it('leaves out a type the schema doesn’t have, or one with no body to write in', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const kinds = resolveKinds([{type: 'post'}, {type: 'missing'}, {type: 'tag'}], get)
    expect(kinds.map((kind) => kind.type)).toEqual(['post'])
    expect(warn).toHaveBeenCalledTimes(2)
  })
})

describe('resolveConfig', () => {
  it('writes Posts by default', () => {
    expect(resolveConfig().types).toEqual([{type: 'post'}])
  })

  it('refuses an empty or repeated list of types', () => {
    expect(() => resolveConfig({types: []})).toThrow(/at least one/)
    expect(() => resolveConfig({types: ['post', {type: 'post'}]})).toThrow(/listed twice/)
  })

  it('previews Posts at /posts and other types at their type name', () => {
    const {preview} = resolveConfig({preview: {origin: 'https://example.com'}})
    expect(preview?.pathname('hello', 'post')).toBe('/posts/hello')
    expect(preview?.pathname('hello', 'caseStudy')).toBe('/caseStudy/hello')
  })

  it('resolves a relative sorting endpoint against the Studio URL', () => {
    vi.stubGlobal('location', new URL('https://studio.example/workspace/'))
    try {
      expect(resolveConfig({sorting: {endpoint: 'api/sort'}}).sorting?.endpoint).toBe(
        'https://studio.example/workspace/api/sort',
      )
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it.each(['http://localhost:3333/sort', 'http://127.0.0.1/sort', 'http://[::1]/sort'])(
    'permits the loopback sorting endpoint %s',
    (endpoint) => expect(resolveSortingEndpoint(endpoint)).toBe(endpoint),
  )

  it.each(['http://example.org/sort', 'http://localhost.example.org/sort', 'data:text/plain,sort', '/sort'])(
    'rejects the sorting endpoint %s when the Studio is on ordinary HTTP',
    (endpoint) => expect(resolveSortingEndpoint(endpoint, 'http://studio.example')).toBeNull(),
  )

  it('says once why Sorting is off when the endpoint is refused, and only in a browser', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      // The CLI reads the config with no address to resolve against: nothing to say.
      expect(resolveConfig({sorting: {endpoint: '/api/sort'}}).sorting).toBeNull()
      expect(warn).not.toHaveBeenCalled()

      vi.stubGlobal('location', new URL('http://192.168.1.20:3333/'))
      expect(resolveConfig({sorting: {endpoint: '/api/sort'}}).sorting).toBeNull()
      expect(resolveConfig({sorting: {endpoint: '/api/sort'}}).sorting).toBeNull()
      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn.mock.calls[0]![0]).toContain('Sorting is off')
    } finally {
      vi.unstubAllGlobals()
      warn.mockRestore()
    }
  })

  it('changes only the accent, for the scheme given', () => {
    const {colors} = resolveConfig({accent: {light: '#2F6FA8'}})
    expect(colors.light.accent).toBe('#2F6FA8')
    expect(colors.light.paper).toBe(resolveConfig().colors.light.paper)
    expect(colors.dark).toEqual(resolveConfig().colors.dark)
  })
})
