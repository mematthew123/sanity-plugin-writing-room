import {describe, expect, it} from 'vitest'
import {isEmptyPost} from './empty-post'

const block = (text: string) => ({_type: 'block', _key: 'b', children: [{_type: 'span', _key: 's', text}]})

describe('isEmptyPost', () => {
  it('is empty with no title and no body', () => {
    expect(isEmptyPost({})).toBe(true)
  })

  it('is empty when the body is only blank lines and the title is whitespace', () => {
    expect(isEmptyPost({title: '  ', body: [block(''), block('')]})).toBe(true)
  })

  it('is not empty once there is a title', () => {
    expect(isEmptyPost({title: 'Notes'})).toBe(false)
  })

  it('is not empty once the body has any words', () => {
    expect(isEmptyPost({body: [block(''), block('A')]})).toBe(false)
  })

  it('is not empty when the body holds an image, Embed or other object', () => {
    expect(isEmptyPost({body: [{_type: 'sectionBreak', _key: 'x'}]})).toBe(false)
  })

  it('treats a missing document as empty', () => {
    expect(isEmptyPost(null)).toBe(true)
  })

  it('ignores system fields and an empty slug', () => {
    expect(
      isEmptyPost({
        _id: 'drafts.abc',
        _type: 'post',
        _rev: 'r',
        _createdAt: '2026-11-07T00:00:00Z',
        _updatedAt: '2026-11-07T00:00:00Z',
        slug: {_type: 'slug', current: ''},
        tags: [],
      }),
    ).toBe(true)
  })

  it.each([
    ['an excerpt', {excerpt: 'A short note.'}],
    ['a cover image', {coverImage: {_type: 'image', asset: {_type: 'reference', _ref: 'image-abc-1x1-jpg'}}}],
    ['tags', {tags: ['slowness']}],
    ['a hand-set slug', {slug: {_type: 'slug', current: 'notes'}}],
    ['a published date', {publishedAt: '2026-01-01T00:00:00Z'}],
  ])('is not empty when Details hold %s', (_, details) => {
    expect(isEmptyPost(details)).toBe(false)
  })
})
