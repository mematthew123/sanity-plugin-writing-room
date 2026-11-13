import {createSchema, type ObjectSchemaType} from 'sanity'
import {describe, expect, it} from 'vitest'
import {addressKind, hasRoomChrome, roomInputKind} from './input-kind'

const Custom = () => null

const schema = createSchema({
  name: 'test',
  types: [
    {
      name: 'everything',
      type: 'document',
      fields: [
        {name: 'subtitle', type: 'string'},
        {name: 'link', type: 'url'},
        {name: 'excerpt', type: 'text'},
        {name: 'order', type: 'number'},
        {name: 'featured', type: 'boolean'},
        {name: 'day', type: 'date'},
        {name: 'publishedAt', type: 'datetime'},
        {name: 'slug', type: 'slug'},
        {name: 'tags', type: 'array', of: [{type: 'string'}], options: {layout: 'tags'}},
        {name: 'aliases', type: 'array', of: [{type: 'string'}]},
        {name: 'mood', type: 'string', options: {list: ['calm', 'loud']}},
        {name: 'rating', type: 'number', options: {list: [1, 2, 3]}},
        {name: 'cover', type: 'image'},
        {name: 'author', type: 'reference', to: [{type: 'everything'}]},
        {name: 'seo', type: 'object', fields: [{name: 'title', type: 'string'}]},
        {name: 'colour', type: 'string', components: {input: Custom}},
        {name: 'framed', type: 'string', components: {field: Custom}},
      ],
    },
  ],
})
const fields = (schema.get('everything') as ObjectSchemaType).fields
const type = (name: string) => fields.find((field) => field.name === name)!.type

describe('roomInputKind', () => {
  it('names each simple field the room draws itself', () => {
    const kinds = Object.fromEntries(
      ['subtitle', 'link', 'excerpt', 'order', 'featured', 'day', 'publishedAt', 'slug', 'tags'].map((name) => [
        name,
        roomInputKind(type(name)),
      ]),
    )
    expect(kinds).toEqual({
      subtitle: 'string',
      link: 'string',
      excerpt: 'text',
      order: 'number',
      featured: 'boolean',
      day: 'date',
      publishedAt: 'datetime',
      slug: 'slug',
      tags: 'tags',
    })
  })

  it('leaves lists of choices, plain arrays and complex fields to Sanity', () => {
    for (const name of ['aliases', 'mood', 'rating', 'cover', 'author', 'seo']) {
      expect(roomInputKind(type(name)), name).toBeNull()
    }
  })

  it('never replaces a Studio’s own input', () => {
    expect(roomInputKind(type('colour'))).toBeNull()
  })
})

describe('addressKind', () => {
  it('tells a web address from a line of prose', () => {
    expect(addressKind(type('link'))).toBe('url')
    expect(addressKind(type('subtitle'))).toBeNull()
  })
})

describe('hasRoomChrome', () => {
  it('draws the label around simple fields, including lists of choices', () => {
    for (const name of ['subtitle', 'excerpt', 'featured', 'slug', 'tags', 'mood', 'colour']) {
      expect(hasRoomChrome(type(name)), name).toBe(true)
    }
  })

  it('leaves complex fields, and a Studio’s own field component, alone', () => {
    for (const name of ['aliases', 'cover', 'author', 'seo', 'framed']) {
      expect(hasRoomChrome(type(name)), name).toBe(false)
    }
  })
})
