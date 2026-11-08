import {describe, expect, it} from 'vitest'
import {displayHref, normalizeHref} from './link'

describe('normalizeHref', () => {
  it.each([
    ['https://example.com/a', 'https://example.com/a'],
    ['  http://example.com  ', 'http://example.com'],
    ['mailto:hi@example.com', 'mailto:hi@example.com'],
    ['hi@example.com', 'mailto:hi@example.com'],
    ['example.com/notes', 'https://example.com/notes'],
  ])('%s → %s', (input, href) => {
    expect(normalizeHref(input)).toBe(href)
  })

  it('returns null for an empty link', () => {
    expect(normalizeHref('   ')).toBeNull()
  })
})

describe('displayHref', () => {
  it.each([
    ['https://www.example.com/notes/', 'example.com/notes'],
    ['mailto:hi@example.com', 'hi@example.com'],
    [`https://example.com/${'a'.repeat(60)}`, `example.com/${'a'.repeat(27)}…`],
  ])('%s → %s', (href, shown) => {
    expect(displayHref(href)).toBe(shown)
  })
})
