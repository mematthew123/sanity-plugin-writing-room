import {createSchema, type SchemaType} from 'sanity'
import {describe, expect, it} from 'vitest'
import {schemaTypes} from '../schema'
import {detectFields} from './fields'

const schema = createSchema({
  name: 'test',
  types: [
    ...schemaTypes,
    {name: 'blockContent', type: 'array', of: [{type: 'block'}, {type: 'image'}]},
    // Chipter's `post`: blockContent body, mainImage, no `excerpt`.
    {
      name: 'chipterPost',
      type: 'document',
      fields: [
        {name: 'title', type: 'string'},
        {name: 'slug', type: 'slug'},
        {name: 'mainImage', title: 'Main image', type: 'image'},
        {name: 'publishedAt', type: 'datetime'},
        {name: 'body', type: 'blockContent'},
        {name: 'blueskyPost', type: 'text'},
        {name: 'socialImage', type: 'image'},
      ],
    },
    // Nothing named the usual way.
    {
      name: 'article',
      type: 'document',
      preview: {select: {title: 'headline'}},
      fields: [
        {name: 'kicker', type: 'string'},
        {name: 'headline', type: 'string'},
        {name: 'summary', type: 'blockContent'},
        {name: 'content', type: 'blockContent'},
        {name: 'url', type: 'slug'},
        {name: 'updatedAt', type: 'datetime'},
        {name: 'datePublished', type: 'date'},
        {name: 'hero', title: 'Hero image', type: 'image'},
      ],
    },
    {name: 'note', type: 'document', fields: [{name: 'title', type: 'string'}, {name: 'body', type: 'blockContent'}]},
    {name: 'tag', type: 'document', fields: [{name: 'title', type: 'string'}]},
  ],
})
const get = (name: string) => schema.get(name) as SchemaType

describe('detectFields', () => {
  it('finds the template Post’s fields', () => {
    expect(detectFields(get('post'))).toEqual({
      fields: {title: 'title', body: 'body', slug: 'slug', publishedAt: 'publishedAt', image: 'coverImage'},
      imageTitle: 'Cover Image',
    })
  })

  it('finds Chipter’s Post: a blockContent body and a main image', () => {
    expect(detectFields(get('chipterPost'))).toEqual({
      fields: {title: 'title', body: 'body', slug: 'slug', publishedAt: 'publishedAt', image: 'mainImage'},
      imageTitle: 'Main image',
    })
  })

  it('reads a schema that names nothing the usual way', () => {
    expect(detectFields(get('article'))).toEqual({
      fields: {title: 'headline', body: 'content', slug: 'url', publishedAt: 'datePublished', image: 'hero'},
      imageTitle: 'Hero image',
    })
  })

  it('works without a slug, a date or an image', () => {
    expect(detectFields(get('note'))).toEqual({
      fields: {title: 'title', body: 'body', slug: undefined, publishedAt: undefined, image: undefined},
      imageTitle: undefined,
    })
  })

  it('lets the Studio name a field the room would otherwise guess', () => {
    const detected = detectFields(get('article'), {body: 'summary'})
    expect('fields' in detected && detected.fields.body).toBe('summary')
  })

  it('explains a type it can’t write in', () => {
    expect(detectFields(get('tag'))).toEqual({problem: expect.stringMatching(/no portable text field/)})
    expect(detectFields(get('note'), {slug: 'permalink'})).toEqual({
      problem: expect.stringMatching(/no field by that name/),
    })
  })
})
