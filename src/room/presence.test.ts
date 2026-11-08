import {describe, expect, it} from 'vitest'
import {presenceSentence} from './presence'

describe('presenceSentence', () => {
  it.each([
    [[], null],
    [['Sam Lee'], 'Sam is here too'],
    [['Sam Lee', 'Alex Kim'], 'Sam and Alex are here too'],
    [['Sam Lee', 'Alex Kim', 'Jo Park'], 'Sam and 2 others are here too'],
  ])('%j → %s', (names, sentence) => {
    expect(presenceSentence(names)).toBe(sentence)
  })
})
