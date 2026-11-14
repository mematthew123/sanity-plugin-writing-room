import {describe, expect, it} from 'vitest'
import {detailsForPublish} from './publish-details'

const NOW = '2026-11-07T12:00:00.000Z'
const free = async () => false

describe('detailsForPublish', () => {
  it('derives the slug and stamps the date on a first publish', async () => {
    expect(await detailsForPublish({post: {title: 'Notes on Slowness'}, isFirstPublish: true, isTaken: free, now: NOW})).toEqual({
      slug: {_type: 'slug', current: 'notes-on-slowness'},
      publishedAt: NOW,
    })
  })

  it('keeps a slug the room or Writer already set, but makes it unique on first publish', async () => {
    const taken = new Set(['notes'])
    expect(
      await detailsForPublish({
        post: {title: 'Notes', slug: {current: 'notes'}},
        isFirstPublish: true,
        isTaken: async (s) => taken.has(s),
        now: NOW,
      }),
    ).toEqual({slug: {_type: 'slug', current: 'notes-2'}, publishedAt: NOW})
  })

  it('never touches the slug or date of an already-published Post', async () => {
    expect(
      await detailsForPublish({
        post: {title: 'New title', slug: {current: 'old-title'}, publishedAt: '2026-01-01T00:00:00Z'},
        isFirstPublish: false,
        isTaken: async () => true,
        now: NOW,
      }),
    ).toEqual({})
  })

  it('still fills a slug that went missing after publishing', async () => {
    expect(
      await detailsForPublish({post: {title: 'Hello', publishedAt: NOW}, isFirstPublish: false, isTaken: free, now: NOW}),
    ).toEqual({slug: {_type: 'slug', current: 'hello'}})
  })

  it('falls back to a unique slug when the title can’t produce one', async () => {
    const taken = new Set(['post'])
    expect(
      await detailsForPublish({
        post: {title: '静かな朝'},
        isFirstPublish: true,
        isTaken: async (s) => taken.has(s),
        now: NOW,
      }),
    ).toEqual({slug: {_type: 'slug', current: 'post-2'}, publishedAt: NOW})
  })

  describe('for a time promised ahead', () => {
    const FRIDAY = '2026-11-13T09:00:00.000Z'
    const MONDAY = '2026-11-16T09:00:00.000Z'
    const scheduled = {title: 'Hello', slug: {current: 'hello'}}

    it('stamps the promised time, when readers first see it, not the moment of scheduling', async () => {
      expect(await detailsForPublish({post: {title: 'Hello'}, isFirstPublish: true, isTaken: free, now: FRIDAY})).toEqual({
        slug: {_type: 'slug', current: 'hello'},
        publishedAt: FRIDAY,
      })
    })

    it('moves the date with the promise, while it is still the one the room wrote', async () => {
      expect(
        await detailsForPublish({
          post: {...scheduled, publishedAt: '2026-11-13T09:00:00Z'},
          isFirstPublish: false,
          isTaken: free,
          now: MONDAY,
          promisedBefore: FRIDAY,
        }),
      ).toEqual({publishedAt: MONDAY})
    })

    it('leaves a date the Writer set by hand where it is', async () => {
      expect(
        await detailsForPublish({
          post: {...scheduled, publishedAt: '2026-11-01T00:00:00.000Z'},
          isFirstPublish: false,
          isTaken: free,
          now: MONDAY,
          promisedBefore: FRIDAY,
        }),
      ).toEqual({})
    })

    it('writes nothing when the promise is made again for the same time', async () => {
      expect(
        await detailsForPublish({
          post: {...scheduled, publishedAt: FRIDAY},
          isFirstPublish: false,
          isTaken: free,
          now: FRIDAY,
          promisedBefore: FRIDAY,
        }),
      ).toEqual({})
    })
  })
})
