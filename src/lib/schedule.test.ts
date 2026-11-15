import {describe, expect, it} from 'vitest'
import {
  changedAtLocally,
  draftFromScheduledVersion,
  formatGoLive,
  fromLocalInput,
  isRoomStampedDate,
  scheduleFor,
  type ScheduleRelease,
  settlesIn,
  STALE_AFTER_MS,
  suggestedTime,
  toLocalInput,
} from './schedule'

const NOW = new Date('2026-11-18T12:00:00Z').getTime()
const FRIDAY = '2026-11-20T09:00:00.000Z'

function release(overrides: Partial<ScheduleRelease> & {id?: string} = {}): ScheduleRelease {
  const {id = 'rABC', ...rest} = overrides
  return {
    _id: `_.releases.${id}`,
    state: 'scheduled',
    _updatedAt: '2026-11-18T10:00:00Z',
    publishAt: FRIDAY,
    metadata: {releaseType: 'scheduled', cardinality: 'one', intendedPublishAt: FRIDAY},
    ...rest,
  }
}

describe('scheduleFor', () => {
  it('is none without a version in a single-document release', () => {
    expect(scheduleFor('post1', [], [release()], NOW)).toEqual({kind: 'none'})
    expect(scheduleFor('post1', ['versions.rABC.other'], [release()], NOW)).toEqual({kind: 'none'})
  })

  it('is scheduled when its release is, at the time Sanity will publish', () => {
    const later = '2026-11-21T09:00:00.000Z'
    expect(scheduleFor('post1', ['versions.rABC.post1'], [release({publishAt: later})], NOW)).toEqual({
      kind: 'scheduled',
      releaseId: 'rABC',
      publishAt: later,
    })
  })

  it('leaves a document in a larger release to Studio', () => {
    const many = release({metadata: {releaseType: 'scheduled', cardinality: 'many'}})
    const unset = release({metadata: {releaseType: 'scheduled'}})
    expect(scheduleFor('post1', ['versions.rABC.post1'], [many], NOW).kind).toBe('none')
    expect(scheduleFor('post1', ['versions.rABC.post1'], [unset], NOW).kind).toBe('none')
  })

  it('is settling while a release moves between states', () => {
    const justNow = new Date(NOW - 5_000).toISOString()
    for (const state of ['scheduling', 'unscheduling', 'publishing', 'archiving']) {
      const moving = release({state, _updatedAt: justNow})
      expect(scheduleFor('post1', ['versions.rABC.post1'], [moving], NOW).kind).toBe('settling')
    }
  })

  it('calls a release stuck between states stale, so it can be unlocked', () => {
    const aWhileAgo = new Date(NOW - STALE_AFTER_MS).toISOString()
    for (const state of ['scheduling', 'unscheduling', 'publishing', 'archiving']) {
      const stuck = release({state, _updatedAt: aWhileAgo})
      expect(scheduleFor('post1', ['versions.rABC.post1'], [stuck], NOW)).toEqual({
        kind: 'stale',
        releaseId: 'rABC',
        intendedPublishAt: FRIDAY,
      })
    }
  })

  it('does the same for a scheduled release that has no time to go live', () => {
    const noTime = {publishAt: undefined, metadata: {releaseType: 'scheduled', cardinality: 'one'}}
    const versions = ['versions.rABC.post1']
    const justNow = new Date(NOW - 5_000).toISOString()
    expect(scheduleFor('post1', versions, [release({...noTime, _updatedAt: justNow})], NOW).kind).toBe('settling')
    expect(scheduleFor('post1', versions, [release(noTime)], NOW).kind).toBe('stale')
  })

  it('gives an unscheduled release a minute before calling it stale', () => {
    const justNow = new Date(NOW - 5_000).toISOString()
    const aWhileAgo = new Date(NOW - STALE_AFTER_MS).toISOString()
    const versions = ['versions.rABC.post1']
    expect(scheduleFor('post1', versions, [release({state: 'active', _updatedAt: justNow})], NOW).kind).toBe('settling')
    expect(scheduleFor('post1', versions, [release({state: 'active', _updatedAt: aWhileAgo})], NOW)).toEqual({
      kind: 'stale',
      releaseId: 'rABC',
      intendedPublishAt: FRIDAY,
    })
  })

  it('prefers the release that will go live over one left behind', () => {
    const stale = release({id: 'rOLD', state: 'active', _updatedAt: '2026-11-01T00:00:00Z'})
    const live = release({id: 'rNEW'})
    const versions = ['versions.rOLD.post1', 'versions.rNEW.post1']
    expect(scheduleFor('post1', versions, [stale, live], NOW)).toMatchObject({kind: 'scheduled', releaseId: 'rNEW'})
  })

  it('ignores releases that are finished', () => {
    for (const state of ['published', 'archived']) {
      expect(scheduleFor('post1', ['versions.rABC.post1'], [release({state})], NOW).kind).toBe('none')
    }
  })
})

describe('changedAtLocally', () => {
  const updated = new Date(NOW - 10 * 60_000).toISOString()

  it('times a change that arrived while watching from when it was seen, whatever Sanity’s clock says', () => {
    // A browser clock two minutes ahead: by it, a release made this second is already old.
    const fresh = release({state: 'active', _updatedAt: new Date(NOW - 120_000).toISOString()})
    const at = changedAtLocally(fresh, {seenAt: NOW, arrived: true})
    expect(at).toBe(NOW)
    const timed = {...fresh, _updatedAt: new Date(at).toISOString()}
    expect(scheduleFor('post1', ['versions.rABC.post1'], [timed], NOW).kind).toBe('settling')
  })

  it('takes Sanity’s word for a release that was already there', () => {
    const old = release({state: 'active', _updatedAt: updated})
    expect(changedAtLocally(old, {seenAt: NOW, arrived: false})).toBe(NOW - 10 * 60_000)
  })

  it('never puts a change later than when it was seen: a slow clock waits a minute at most', () => {
    const ahead = release({state: 'active', _updatedAt: new Date(NOW + 5 * 60_000).toISOString()})
    expect(changedAtLocally(ahead, {seenAt: NOW, arrived: false})).toBe(NOW)
  })

  it('treats a release that doesn’t say when it changed as long since', () => {
    expect(changedAtLocally(release({_updatedAt: undefined}), {seenAt: NOW, arrived: false})).toBe(0)
  })
})

describe('settlesIn', () => {
  it('says how long until an unscheduled release counts as stale', () => {
    const updated = new Date(NOW - 20_000).toISOString()
    expect(settlesIn(release({state: 'active', _updatedAt: updated}), NOW)).toBe(STALE_AFTER_MS - 20_000)
  })

  it('waits on a release between states too', () => {
    const updated = new Date(NOW - 20_000).toISOString()
    expect(settlesIn(release({state: 'unscheduling', _updatedAt: updated}), NOW)).toBe(STALE_AFTER_MS - 20_000)
  })

  it('has nothing to wait for otherwise', () => {
    expect(settlesIn(release(), NOW)).toBeNull()
    expect(settlesIn(release({state: 'active', _updatedAt: '2026-11-01T00:00:00Z'}), NOW)).toBeNull()
  })
})

describe('isRoomStampedDate', () => {
  it('is a date that is the very moment of the schedule', () => {
    expect(isRoomStampedDate(FRIDAY, FRIDAY)).toBe(true)
    expect(isRoomStampedDate('2026-11-20T10:00:00+01:00', FRIDAY)).toBe(true)
  })

  it('is not a date the Writer set, or no date at all', () => {
    expect(isRoomStampedDate('2026-11-19T09:00:00.000Z', FRIDAY)).toBe(false)
    expect(isRoomStampedDate(undefined, FRIDAY)).toBe(false)
    expect(isRoomStampedDate(FRIDAY, undefined)).toBe(false)
    expect(isRoomStampedDate('soon', FRIDAY)).toBe(false)
  })
})

describe('draftFromScheduledVersion', () => {
  const version = {
    _id: 'versions.rABC.post1',
    _type: 'post',
    _rev: 'rev1',
    _updatedAt: '2026-11-18T10:00:00Z',
    _createdAt: '2026-11-01T10:00:00Z',
    _system: {delete: false},
    title: 'Quiet mornings',
    publishedAt: FRIDAY,
  }

  it('carries the content over to the draft', () => {
    expect(draftFromScheduledVersion(version, {documentId: 'post1'})).toEqual({
      _id: 'drafts.post1',
      _type: 'post',
      title: 'Quiet mornings',
      publishedAt: FRIDAY,
    })
  })

  it('clears a published date the room stamped for the schedule', () => {
    const draft = draftFromScheduledVersion(version, {documentId: 'post1', dateField: 'publishedAt', scheduledFor: FRIDAY})
    expect(draft).not.toHaveProperty('publishedAt')
  })

  it('keeps a published date the Writer set', () => {
    const draft = draftFromScheduledVersion(
      {...version, publishedAt: '2026-01-01T00:00:00.000Z'},
      {documentId: 'post1', dateField: 'publishedAt', scheduledFor: FRIDAY},
    )
    expect(draft.publishedAt).toBe('2026-01-01T00:00:00.000Z')
  })
})

describe('the schedule panel’s time', () => {
  it('round-trips through a datetime-local input', () => {
    const date = new Date(2026, 10, 20, 9, 5)
    expect(toLocalInput(date)).toBe('2026-11-20T09:05')
    expect(fromLocalInput('2026-11-20T09:05')?.getTime()).toBe(date.getTime())
  })

  it('reads an empty input as no time', () => {
    expect(fromLocalInput('')).toBeNull()
    expect(fromLocalInput('never')).toBeNull()
  })

  it('opens on the time it was last scheduled for, when that is still ahead', () => {
    const now = new Date(2026, 10, 18, 12, 0)
    const ahead = new Date(2026, 10, 20, 9, 0)
    expect(suggestedTime(ahead.toISOString(), now).getTime()).toBe(ahead.getTime())
  })

  it('opens on nine tomorrow morning otherwise', () => {
    const now = new Date(2026, 10, 18, 12, 0)
    const nine = new Date(2026, 10, 19, 9, 0).getTime()
    expect(suggestedTime(undefined, now).getTime()).toBe(nine)
    expect(suggestedTime(new Date(2026, 10, 17, 9, 0).toISOString(), now).getTime()).toBe(nine)
  })
})

describe('formatGoLive', () => {
  const options = {now: new Date(NOW), timeZone: 'UTC'}

  it('says the day and the time', () => {
    expect(formatGoLive(FRIDAY, options)).toBe('Friday 20 November at 09:00')
  })

  it('is in the time zone asked for', () => {
    expect(formatGoLive(FRIDAY, {...options, timeZone: 'America/New_York'})).toBe('Friday 20 November at 04:00')
  })

  it('adds the year when it is not this one', () => {
    expect(formatGoLive('2027-01-04T09:00:00.000Z', options)).toBe('Monday 4 January 2027 at 09:00')
  })

  it('is brief for the Lobby: the weekday alone within the week', () => {
    expect(formatGoLive(FRIDAY, {...options, short: true})).toBe('Friday at 09:00')
    expect(formatGoLive('2026-12-04T09:00:00.000Z', {...options, short: true})).toBe('4 December at 09:00')
  })
})
