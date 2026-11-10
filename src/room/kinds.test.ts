import {type SchemaType} from 'sanity'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {resolveConfig} from '../config'
import {pluralize, resolveKinds} from './kinds'

function schemaType(title: string | undefined, fields: string[] = []): SchemaType {
  return {title, fields: fields.map((name) => ({name}))} as unknown as SchemaType
}

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

  const schema: Record<string, SchemaType> = {
    post: schemaType('Post', ['title', 'body', 'coverImage']),
    caseStudy: schemaType('Case Study', ['title', 'body']),
    newsItem: schemaType(undefined),
  }
  const get = (name: string) => schema[name]

  it('names each type from its schema title, in the order given', () => {
    expect(resolveKinds(resolveConfig({types: ['post', 'caseStudy']}).types, get)).toEqual([
      {type: 'post', singular: 'Post', plural: 'Posts', hasCoverImage: true},
      {type: 'caseStudy', singular: 'Case Study', plural: 'Case Studies', hasCoverImage: false},
    ])
  })

  it('prefers the names given in the options', () => {
    const types = resolveConfig({types: [{type: 'newsItem', title: 'News', pluralTitle: 'News'}]}).types
    expect(resolveKinds(types, get)).toEqual([
      {type: 'newsItem', singular: 'News', plural: 'News', hasCoverImage: false},
    ])
  })

  it('falls back to the type name when the schema type has no title', () => {
    expect(resolveKinds([{type: 'newsItem'}], get)[0]?.singular).toBe('News Item')
  })

  it('leaves out a type the schema doesn’t have', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(resolveKinds([{type: 'post'}, {type: 'missing'}], get).map((kind) => kind.type)).toEqual(['post'])
    expect(warn).toHaveBeenCalledOnce()
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
})
