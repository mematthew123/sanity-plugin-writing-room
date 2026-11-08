import {describe, expect, it} from 'vitest'
import {followingSlug, slugify, uniqueSlug} from './slug'

describe('slugify', () => {
  it('lowercases and hyphenates words', () => {
    expect(slugify('Notes on Slowness')).toBe('notes-on-slowness')
  })

  it('drops accents and punctuation', () => {
    expect(slugify('Café, Crème & Brûlée: A Story!')).toBe('cafe-creme-and-brulee-a-story')
  })

  it('collapses separators and trims the ends', () => {
    expect(slugify('  --Hello   ---  World--  ')).toBe('hello-world')
  })

  it('keeps long slugs readable by cutting at a word boundary', () => {
    const slug = slugify('word '.repeat(40))
    expect(slug.length).toBeLessThanOrEqual(96)
    expect(slug.endsWith('-')).toBe(false)
    expect(slug.endsWith('word')).toBe(true)
  })

  it('returns an empty string when nothing usable is left', () => {
    expect(slugify('✦ ✦ ✦')).toBe('')
  })
})

describe('uniqueSlug', () => {
  it('keeps the slug when nobody else has it', async () => {
    expect(await uniqueSlug('notes', async () => false)).toBe('notes')
  })

  it('quietly appends -2, -3… on a clash', async () => {
    const taken = new Set(['notes', 'notes-2'])
    expect(await uniqueSlug('notes', async (s) => taken.has(s))).toBe('notes-3')
  })
})

describe('followingSlug', () => {
  it('starts following as soon as a title appears', () => {
    expect(followingSlug({previousTitle: '', nextTitle: 'Notes', currentSlug: undefined})).toBe('notes')
  })

  it('keeps following while the slug still matches the previous title', () => {
    expect(
      followingSlug({previousTitle: 'Notes', nextTitle: 'Notes on Slowness', currentSlug: 'notes'}),
    ).toBe('notes-on-slowness')
  })

  it('stops following once the Writer has set the slug by hand', () => {
    expect(
      followingSlug({previousTitle: 'Notes', nextTitle: 'Notes on Slowness', currentSlug: 'slow'}),
    ).toBeUndefined()
  })

  it('clears the slug when the title is erased', () => {
    expect(followingSlug({previousTitle: 'Notes', nextTitle: '', currentSlug: 'notes'})).toBe('')
  })
})
