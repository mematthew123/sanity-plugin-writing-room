import {describe, expect, it} from 'vitest'
import {describePostStatus, timeAgo} from './post-status'

describe('describePostStatus', () => {
  it('calls a never-published Post a draft', () => {
    expect(describePostStatus({lastEditedDraftAt: '2026-11-07T10:00:00Z'})).toEqual({
      label: 'Draft',
      lastEditedAt: '2026-11-07T10:00:00Z',
    })
  })

  it('calls a Post with no newer draft published', () => {
    expect(describePostStatus({lastEditedPublishedAt: '2026-11-06T10:00:00Z'})).toEqual({
      label: 'Published',
      lastEditedAt: '2026-11-06T10:00:00Z',
    })
  })

  it('flags edits made since publishing, dated by the most recent edit', () => {
    expect(
      describePostStatus({
        lastEditedPublishedAt: '2026-11-06T10:00:00Z',
        lastEditedDraftAt: '2026-11-07T09:00:00Z',
      }),
    ).toEqual({label: 'Published · unpublished changes', lastEditedAt: '2026-11-07T09:00:00Z'})
  })

  it('treats a missing status as a fresh draft', () => {
    expect(describePostStatus(undefined)).toEqual({label: 'Draft', lastEditedAt: undefined})
  })
})

describe('timeAgo', () => {
  const now = new Date('2026-11-07T12:00:00Z')

  it.each([
    ['2026-11-07T11:59:40Z', 'just now'],
    ['2026-11-07T11:55:00Z', '5 minutes ago'],
    ['2026-11-07T10:00:00Z', '2 hours ago'],
    ['2026-11-06T12:00:00Z', 'yesterday'],
    ['2026-11-01T12:00:00Z', '6 days ago'],
    ['2026-10-17T12:00:00Z', '3 weeks ago'],
    ['2026-08-07T12:00:00Z', '3 months ago'],
    ['2024-11-07T12:00:00Z', '2 years ago'],
  ])('%s → %s', (date, expected) => {
    expect(timeAgo(date, now)).toBe(expected)
  })
})
