import {describe, expect, it} from 'vitest'
import {nextStep, type StepKind, stepsToConsider} from './next-step'

const KINDS: Record<string, StepKind | 'skip'> = {
  publish: 'room',
  delete: 'builtin',
  duplicate: 'builtin',
  review: 'custom',
  approve: 'custom',
  openInRoom: 'skip',
}
const consider = (...names: string[]) => stepsToConsider(names, (name) => KINDS[name]!)
const names = (steps: Array<{action: string}>) => steps.map((step) => step.action)

describe('stepsToConsider', () => {
  it('stops at Publish in a Studio that left its actions alone', () => {
    expect(consider('publish', 'delete', 'duplicate', 'openInRoom')).toEqual([{action: 'publish', kind: 'room'}])
  })

  it('keeps a custom action that comes before Publish, and Publish behind it', () => {
    expect(names(consider('review', 'publish', 'delete'))).toEqual(['review', 'publish'])
  })

  it('stops at the first of Sanity’s own when Publish was removed', () => {
    expect(consider('delete', 'duplicate', 'review')).toEqual([{action: 'delete', kind: 'builtin'}])
  })

  it('keeps every custom action up to the first that isn’t', () => {
    expect(names(consider('review', 'approve', 'delete', 'publish'))).toEqual(['review', 'approve', 'delete'])
  })

  it('passes over what isn’t a step', () => {
    expect(names(consider('openInRoom', 'review'))).toEqual(['review'])
    expect(consider('openInRoom')).toEqual([])
  })
})

describe('nextStep', () => {
  it('is the first custom action that has something to show', () => {
    const steps = consider('review', 'approve', 'publish')
    expect(nextStep(steps, () => true)?.step.action).toBe('review')
    expect(nextStep(steps, (step) => step.action === 'approve')).toEqual({
      step: {action: 'approve', kind: 'custom'},
      index: 1,
    })
  })

  it('falls through to Publish when every custom action before it shows nothing', () => {
    expect(nextStep(consider('review', 'publish'), () => false)?.step.kind).toBe('room')
  })

  it('falls through to one of Sanity’s own, which the room never offers', () => {
    expect(nextStep(consider('review', 'delete'), () => false)?.step.kind).toBe('builtin')
  })

  it('is nothing when there is nothing to show', () => {
    expect(nextStep(consider('review'), () => false)).toBeNull()
    expect(nextStep([], () => true)).toBeNull()
  })
})
