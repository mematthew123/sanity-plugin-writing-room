import {describe, expect, it} from 'vitest'
import {clockName, defaultPromisedTime, describePromisedTime, isAhead, MAX_TIMER_MS, waitUntil} from './promised-time'

// A Wednesday morning in Lisbon, where winter time is UTC.
const lisbon = {now: new Date('2026-11-11T10:00:00Z'), timeZone: 'Europe/Lisbon', hour12: false}

describe('describePromisedTime', () => {
  it('names the day within the coming week', () => {
    expect(describePromisedTime('2026-11-13T09:00:00Z', lisbon)).toBe('Friday at 9:00')
    expect(describePromisedTime('2026-11-17T09:00:00Z', lisbon)).toBe('Tuesday at 9:00')
  })

  it('says today and tomorrow, which a day’s name would leave in doubt', () => {
    expect(describePromisedTime('2026-11-11T17:30:00Z', lisbon)).toBe('today at 17:30')
    expect(describePromisedTime('2026-11-12T09:00:00Z', lisbon)).toBe('tomorrow at 9:00')
  })

  it('gives the date from a week out, so a day’s name is never next week’s', () => {
    expect(describePromisedTime('2026-11-18T09:00:00Z', lisbon)).toBe('18 November at 9:00')
  })

  it('adds the year only when it is another one', () => {
    expect(describePromisedTime('2027-03-12T09:00:00Z', lisbon)).toBe('12 March 2027 at 9:00')
  })

  it('gives the date for a time that has gone by', () => {
    expect(describePromisedTime('2026-11-09T09:00:00Z', lisbon)).toBe('9 November at 9:00')
  })

  it('reads the same moment on each Writer’s own clock', () => {
    const newYork = {...lisbon, timeZone: 'America/New_York'}
    expect(describePromisedTime('2026-11-13T09:00:00Z', newYork)).toBe('Friday at 4:00')
  })

  it('counts days on the Writer’s calendar, not in hours', () => {
    // 23:30 on Wednesday in Lisbon; half an hour later is tomorrow.
    const lateWednesday = {...lisbon, now: new Date('2026-11-11T23:30:00Z')}
    expect(describePromisedTime('2026-11-12T00:00:00Z', lateWednesday)).toBe('tomorrow at 0:00')
  })

  it('uses a twelve-hour clock for a Writer who reads time that way', () => {
    expect(describePromisedTime('2026-11-13T21:05:00Z', {...lisbon, hour12: true})).toBe('Friday at 9:05 pm')
    expect(describePromisedTime('2026-11-13T00:00:00Z', {...lisbon, hour12: true})).toBe('Friday at 12:00 am')
  })
})

describe('defaultPromisedTime', () => {
  it('starts at nine tomorrow morning, the Writer’s time', () => {
    const now = new Date(2026, 10, 11, 16, 42)
    const start = new Date(defaultPromisedTime(now))
    expect([start.getFullYear(), start.getMonth(), start.getDate()]).toEqual([2026, 10, 12])
    expect([start.getHours(), start.getMinutes(), start.getSeconds()]).toEqual([9, 0, 0])
  })
})

describe('isAhead', () => {
  const now = new Date('2026-11-11T10:00:00Z')

  it('is true only for a time still to come', () => {
    expect(isAhead('2026-11-11T10:00:01Z', now)).toBe(true)
    expect(isAhead('2026-11-11T10:00:00Z', now)).toBe(false)
    expect(isAhead('2026-11-10T10:00:00Z', now)).toBe(false)
  })

  it('is false for no time, or one that can’t be read', () => {
    expect(isAhead(undefined, now)).toBe(false)
    expect(isAhead('soon', now)).toBe(false)
  })
})

describe('waitUntil', () => {
  const now = new Date('2026-11-11T10:00:00Z')
  const after = (ms: number) => new Date(now.getTime() + ms).toISOString()

  it('waits until just past the time', () => {
    expect(waitUntil(after(60_000), now)).toBe(61_000)
  })

  it('never waits longer than a timer can count', () => {
    expect(waitUntil(after(MAX_TIMER_MS - 1000), now)).toBe(MAX_TIMER_MS)
    expect(waitUntil(after(MAX_TIMER_MS - 999), now)).toBe(MAX_TIMER_MS)
    expect(waitUntil(after(MAX_TIMER_MS * 3), now)).toBe(MAX_TIMER_MS)
  })

  it('gets there in capped steps, however far off the time is', () => {
    const at = after(MAX_TIMER_MS * 2.5)
    let clock = now
    const waits: number[] = []
    for (let wait = waitUntil(at, clock); wait !== null; wait = waitUntil(at, clock)) {
      waits.push(wait)
      clock = new Date(clock.getTime() + wait)
    }
    expect(waits).toHaveLength(3)
    expect(clock.getTime()).toBeGreaterThan(new Date(at).getTime())
  })

  it('has nothing to wait for once the time has come', () => {
    expect(waitUntil(after(0), now)).toBeNull()
    expect(waitUntil(after(-1), now)).toBeNull()
    expect(waitUntil('soon', now)).toBeNull()
  })
})

describe('clockName', () => {
  it('names the clock by its place', () => {
    expect(clockName('Europe/Lisbon')).toBe('Lisbon time')
    expect(clockName('America/Argentina/Buenos_Aires')).toBe('Buenos Aires time')
  })

  it('says UTC where there is no place to name', () => {
    expect(clockName('UTC')).toBe('UTC')
    expect(clockName('Etc/UTC')).toBe('UTC')
  })
})
