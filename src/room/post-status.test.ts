import {describe, expect, it} from 'vitest'
import {describePostStatus, statusText, timeAgo} from './post-status'

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

describe('statusText', () => {
  const options = {now: new Date('2026-11-18T12:00:00Z'), timeZone: 'UTC'}
  const scheduled = {kind: 'scheduled', releaseId: 'rABC', publishAt: '2026-11-20T09:00:00.000Z'} as const
  const draft = {label: 'Draft', lastEditedAt: undefined} as const
  const changed = {label: 'Published · unpublished changes', lastEditedAt: undefined} as const

  it('is the plain status when nothing is scheduled', () => {
    expect(statusText(draft, {kind: 'none'}, options)).toBe('Draft')
  })

  it('says when a scheduled document goes live', () => {
    expect(statusText(draft, scheduled, options)).toBe('Scheduled · Friday 20 November at 09:00')
  })

  it('says a published document’s changes are scheduled', () => {
    expect(statusText(changed, scheduled, options)).toBe(
      'Published · changes scheduled for Friday 20 November at 09:00',
    )
    expect(statusText(changed, scheduled, {...options, short: true})).toBe('Changes scheduled · Friday at 09:00')
  })

  it('says plainly when a schedule was left hanging', () => {
    expect(statusText(draft, {kind: 'stale', releaseId: 'rABC'}, options)).toBe('Not scheduled · won’t go live')
  })

  it('says a schedule is being updated', () => {
    expect(statusText(draft, {kind: 'settling', releaseId: 'rABC'}, options)).toBe('Updating the schedule…')
  })
})
