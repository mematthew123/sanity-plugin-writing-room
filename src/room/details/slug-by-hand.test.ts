import {describe, expect, it} from 'vitest'
import {followingSlug} from '../../lib/slug'
import {slugByHand} from './slug-by-hand'

describe('slugByHand', () => {
  it('keeps a slug typed in Details from being taken for one that follows the title', () => {
    slugByHand.note('a', 'my-own')
    // The App SDK's copy still has the slug made from the title.
    const stale = 'a-title'
    expect(followingSlug({previousTitle: 'A title', nextTitle: 'A title!', currentSlug: stale})).toBe('a-title')
    expect(
      followingSlug({previousTitle: 'A title', nextTitle: 'A title!', currentSlug: slugByHand.read('a') ?? stale}),
    ).toBeUndefined()
  })

  it('knows an emptied slug from one never typed, and one document from another', () => {
    slugByHand.note('b', '')
    expect(slugByHand.read('b')).toBe('')
    expect(slugByHand.read('c')).toBeUndefined()
    slugByHand.forget('b')
    expect(slugByHand.read('b')).toBeUndefined()
  })
})
