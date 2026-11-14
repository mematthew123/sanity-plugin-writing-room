import {describe, expect, it} from 'vitest'
import {describePostStatus, timeAgo} from './post-status'

// A Wednesday morning in Lisbon, where winter time is UTC.
const clock = {now: new Date('2026-11-11T10:00:00Z'), timeZone: 'Europe/Lisbon', hour12: false}
const friday = '2026-11-13T09:00:00Z'

describe('describePostStatus', () => {
  it('calls a never-published Post a draft', () => {
    expect(describePostStatus({lastEditedDraftAt: '2026-11-07T10:00:00Z'})).toEqual({
      label: 'Draft',
      short: 'Draft',
      lastEditedAt: '2026-11-07T10:00:00Z',
      isPublished: false,
      unseen: true,
      next: 'publish',
      locked: false,
    })
  })

  it('calls a Post with no newer draft published, with nothing left to do', () => {
    expect(describePostStatus({lastEditedPublishedAt: '2026-11-06T10:00:00Z'})).toEqual({
      label: 'Published',
      short: 'Published',
      lastEditedAt: '2026-11-06T10:00:00Z',
      isPublished: true,
      unseen: false,
      next: null,
      locked: false,
    })
  })

  it('flags edits made since publishing, dated by the most recent edit', () => {
    expect(
      describePostStatus({
        lastEditedPublishedAt: '2026-11-06T10:00:00Z',
        lastEditedDraftAt: '2026-11-07T09:00:00Z',
      }),
    ).toMatchObject({
      label: 'Published · unpublished changes',
      short: 'Unpublished changes',
      lastEditedAt: '2026-11-07T09:00:00Z',
      unseen: true,
      next: 'publish-changes',
    })
  })

  it('treats a missing status as a fresh draft', () => {
    expect(describePostStatus(undefined)).toMatchObject({label: 'Draft', lastEditedAt: undefined, next: 'publish'})
  })

  describe('a Scheduled Post', () => {
    const promise = {at: friday, held: false}

    it('says when, and that its words are locked', () => {
      // One Post, one copy: once scheduled there is no draft, only the promised copy.
      expect(describePostStatus({}, {promise, ...clock})).toMatchObject({
        label: 'Scheduled · Friday at 9:00',
        short: 'Scheduled · Friday at 9:00',
        isPublished: false,
        unseen: true,
        next: 'scheduled',
        promisedFor: friday,
        locked: true,
      })
    })

    it('says that it is changes which are scheduled, on a Post readers already have', () => {
      expect(describePostStatus({lastEditedPublishedAt: '2026-11-06T10:00:00Z'}, {promise, ...clock})).toMatchObject({
        label: 'Published · changes scheduled for Friday at 9:00',
        short: 'Changes scheduled for Friday at 9:00',
        isPublished: true,
        unseen: true,
        next: 'scheduled',
        locked: true,
      })
    })

    it('stays Scheduled for the moment between its time and its going live', () => {
      const justAfter = {...clock, now: new Date('2026-11-13T09:00:20Z')}
      expect(describePostStatus({}, {promise, ...justAfter})).toMatchObject({next: 'scheduled', locked: true})
    })

    it('is dated by its own last edit', () => {
      const status = {lastEditedPublishedAt: '2026-11-06T10:00:00Z', lastEditedVersionAt: '2026-11-10T08:00:00Z'}
      expect(describePostStatus(status, {promise, ...clock}).lastEditedAt).toBe('2026-11-10T08:00:00Z')
    })
  })

  describe('a Post taken off the schedule', () => {
    const promise = {at: friday, held: true}

    it('is a Draft again, whose next step is to schedule it again', () => {
      expect(describePostStatus({}, {promise, ...clock})).toMatchObject({
        label: 'Draft',
        unseen: true,
        next: 'schedule-again',
        promisedFor: friday,
        locked: false,
      })
    })

    it('reads as unpublished changes on a Post readers already have', () => {
      expect(describePostStatus({lastEditedPublishedAt: '2026-11-06T10:00:00Z'}, {promise, ...clock})).toMatchObject({
        label: 'Published · unpublished changes',
        short: 'Unpublished changes',
        unseen: true,
        next: 'schedule-again',
      })
    })

    it('is an ordinary Draft once its time has gone by', () => {
      const saturday = {...clock, now: new Date('2026-11-14T10:00:00Z')}
      const status = describePostStatus({}, {promise, ...saturday})
      expect(status).toMatchObject({label: 'Draft', next: 'publish', locked: false})
      expect(status.promisedFor).toBeUndefined()
    })
  })

  describe('a copy in a Release', () => {
    it('goes by the Release’s own title, with nothing to publish from the room', () => {
      const status = {lastEditedPublishedAt: '2026-11-06T10:00:00Z', lastEditedVersionAt: '2026-11-10T08:00:00Z'}
      expect(describePostStatus(status, {release: {title: 'Summer drop'}, ...clock})).toMatchObject({
        label: 'In Summer drop',
        isPublished: true,
        unseen: true,
        next: null,
        locked: false,
      })
    })

    it('says when the Release is scheduled, which locks it', () => {
      const release = {title: 'Summer drop', scheduledFor: friday}
      expect(describePostStatus({}, {release, ...clock})).toMatchObject({
        label: 'In Summer drop · scheduled for Friday at 9:00',
        next: null,
        locked: true,
      })
    })
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
