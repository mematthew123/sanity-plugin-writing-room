import {describe, expect, it} from 'vitest'
import {addTags, fromLocalDateTime, parseNumber, removeTagAt, toLocalDateTime} from './values'

describe('parseNumber', () => {
  it('reads whole numbers, decimals and negatives', () => {
    expect(parseNumber('12')).toBe(12)
    expect(parseNumber('-0.5')).toBe(-0.5)
  })

  it('is undefined for an empty or unreadable field', () => {
    expect(parseNumber('')).toBeUndefined()
    expect(parseNumber('  ')).toBeUndefined()
    expect(parseNumber('twelve')).toBeUndefined()
    expect(parseNumber('12a')).toBeUndefined()
    expect(parseNumber('-')).toBeUndefined()
  })

  it('reads a comma as the decimal mark', () => {
    expect(parseNumber('1,5')).toBe(1.5)
    expect(parseNumber('1.')).toBe(1)
  })

  it('reads only plain decimals, not hex or exponents', () => {
    expect(parseNumber('0x10')).toBeUndefined()
    expect(parseNumber('1e3')).toBeUndefined()
  })
})

describe('local datetimes', () => {
  it('round-trips through the Writer’s own time zone', () => {
    const iso = '2026-11-12T17:30:00.000Z'
    expect(fromLocalDateTime(toLocalDateTime(iso))).toBe(iso)
  })

  it('shows the local wall-clock time, to the minute', () => {
    const local = new Date(2026, 10, 12, 9, 5)
    expect(toLocalDateTime(local.toISOString())).toBe('2026-11-12T09:05')
  })

  it('keeps a year that is still being typed valid for the input', () => {
    const early = new Date(2026, 10, 12, 9, 5)
    early.setFullYear(2)
    expect(toLocalDateTime(early.toISOString())).toBe('0002-11-12T09:05')
  })

  it('treats an empty or unreadable value as no date', () => {
    expect(toLocalDateTime(undefined)).toBe('')
    expect(toLocalDateTime('not a date')).toBe('')
    expect(fromLocalDateTime('')).toBeUndefined()
  })
})

describe('removeTagAt', () => {
  it('removes one tag, leaving another that reads the same', () => {
    expect(removeTagAt(['news', 'news', 'essay'], 0)).toEqual(['news', 'essay'])
  })
})

describe('addTags', () => {
  it('adds what was typed, trimmed', () => {
    expect(addTags(['essay'], '  travel ')).toEqual(['essay', 'travel'])
  })

  it('splits on commas, so a pasted list becomes several tags', () => {
    expect(addTags([], 'one, two,three')).toEqual(['one', 'two', 'three'])
  })

  it('skips blanks and tags already there', () => {
    expect(addTags(['essay'], 'essay, , notes')).toEqual(['essay', 'notes'])
  })
})
