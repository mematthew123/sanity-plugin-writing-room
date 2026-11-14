/** What "now" and "here" are for the Writer. Everything defaults to their own device. */
export interface Clock {
  now?: Date
  /** An IANA zone, e.g. `Europe/Lisbon`. */
  timeZone?: string
  /** Whether the Writer reads the time as 9:00 pm or 21:00. */
  hour12?: boolean
}

const DAY_MS = 24 * 3600 * 1000

const writersHour12 = () => new Intl.DateTimeFormat(undefined, {hour: 'numeric'}).resolvedOptions().hour12 ?? false

function parts(date: Date, options: Intl.DateTimeFormatOptions): Record<string, string> {
  const found: Record<string, string> = {}
  for (const part of new Intl.DateTimeFormat('en', options).formatToParts(date)) found[part.type] = part.value
  return found
}

/** The calendar day a moment falls on in a zone, as a count of days, so two can be compared. */
function dayNumber(date: Date, timeZone: string | undefined): number {
  const {year, month, day} = parts(date, {year: 'numeric', month: 'numeric', day: 'numeric', timeZone})
  return Date.UTC(Number(year), Number(month) - 1, Number(day)) / DAY_MS
}

function timeOfDay(date: Date, timeZone: string | undefined, hour12: boolean): string {
  const {hour, minute, dayPeriod} = parts(date, {
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: hour12 ? 'h12' : 'h23',
    timeZone,
  })
  const time = `${Number(hour)}:${minute}`
  return dayPeriod ? `${time} ${dayPeriod.toLowerCase()}` : time
}

/**
 * A time as the room says it, on the Writer's own clock: "tomorrow at 9:00", "Friday at 9:00"
 * within the coming week, "12 March at 9:00" beyond it. It reads on after "for" or a "·".
 */
export function describePromisedTime(at: string, {now = new Date(), timeZone, hour12 = writersHour12()}: Clock = {}): string {
  const date = new Date(at)
  const time = timeOfDay(date, timeZone, hour12)
  const daysAhead = dayNumber(date, timeZone) - dayNumber(now, timeZone)

  if (daysAhead === 0) return `today at ${time}`
  if (daysAhead === 1) return `tomorrow at ${time}`
  if (daysAhead > 1 && daysAhead < 7) return `${parts(date, {weekday: 'long', timeZone}).weekday} at ${time}`

  const {day, month, year} = parts(date, {day: 'numeric', month: 'long', year: 'numeric', timeZone})
  const sameYear = year === parts(now, {year: 'numeric', timeZone}).year
  return `${day} ${month}${sameYear ? '' : ` ${year}`} at ${time}`
}

/** Where the time input starts for a new schedule: tomorrow at nine, the Writer's time. */
export function defaultPromisedTime(now: Date = new Date()): string {
  const date = new Date(now)
  date.setDate(date.getDate() + 1)
  date.setHours(9, 0, 0, 0)
  return date.toISOString()
}

/** A promise can only be made for a time still to come. */
export function isAhead(at: string | undefined, now: Date = new Date()): boolean {
  if (!at) return false
  const time = new Date(at).getTime()
  return !Number.isNaN(time) && time > now.getTime()
}

/** Whose clock a time is on, said once where it's set: "Lisbon time". */
export function clockName(timeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone): string {
  const place = timeZone.includes('/') ? timeZone.slice(timeZone.lastIndexOf('/') + 1).replace(/_/g, ' ') : ''
  return place && place !== 'UTC' ? `${place} time` : 'UTC'
}
