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
})
