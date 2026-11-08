import {describe, expect, it} from 'vitest'
import {readingTime, wordCount} from './word-count'

const block = (...texts: string[]) => ({
  _type: 'block',
  children: texts.map((text) => ({_type: 'span', text})),
})

describe('wordCount', () => {
  it('counts words across spans and blocks', () => {
    expect(wordCount([block('Notes on ', 'slowness.'), block('It takes time — and that’s fine.')])).toBe(9)
  })

  it('counts code and captions too (not bare symbols), but not the Section Break ornament', () => {
    expect(
      wordCount([
        {_type: 'codeBlock', code: 'const a = 1'},
        {_type: 'image', caption: 'A quiet morning'},
        {_type: 'sectionBreak', kind: 'break'},
      ]),
    ).toBe(6)
  })

  it('is zero for an empty body', () => {
    expect(wordCount(undefined)).toBe(0)
    expect(wordCount([block('   ')])).toBe(0)
  })
})

describe('readingTime', () => {
  it.each([
    [0, null],
    [10, '1 min read'],
    [238, '1 min read'],
    [1240, '6 min read'],
  ])('%i words → %s', (words, label) => {
    expect(readingTime(words)).toBe(label)
  })
})
