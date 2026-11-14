import {describe, expect, it} from 'vitest'
import {foldPhase, isFolding} from './fold'

const R = 'rOnePost1'
const expired = {release: R, expired: true, synced: true, held: null, leftAsIs: null}

describe('foldPhase', () => {
  it('has nothing to fold without a settled release whose time has gone by', () => {
    expect(foldPhase({...expired, release: null})).toBe('none')
    expect(foldPhase({...expired, expired: false})).toBe('none')
  })

  it('waits for what was typed to be saved before holding the page still', () => {
    expect(foldPhase({...expired, synced: false})).toBe('saving')
    expect(isFolding('saving')).toBe(false)
    expect(foldPhase(expired)).toBe('hold')
    expect(isFolding('hold')).toBe(false)
  })

  it('folds once the page is held and saved', () => {
    expect(foldPhase({...expired, held: R})).toBe('fold')
    expect(isFolding('fold')).toBe(true)
  })

  it('keeps holding, without folding, while a last keystroke is saved', () => {
    expect(foldPhase({...expired, held: R, synced: false})).toBe('held')
    expect(isFolding('held')).toBe(true)
  })

  it('lets go of a fold that was given up on', () => {
    expect(foldPhase({...expired, held: R, leftAsIs: R})).toBe('none')
  })

  it('starts over for another release', () => {
    expect(foldPhase({...expired, held: 'rAnother1', leftAsIs: 'rAnother1'})).toBe('hold')
  })
})
