import {describe, expect, it} from 'vitest'
import {isSdkContextError} from './SetupProblem'

describe('isSdkContextError', () => {
  it('recognises the App SDK’s missing-context error', () => {
    const error = new Error(
      'SanityInstance context not found. Please ensure that your component is wrapped in a ResourceProvider or a SanityApp component.',
    )
    expect(isSdkContextError(error)).toBe(true)
  })

  it('leaves every other error to the Studio', () => {
    expect(isSdkContextError(new Error('Network request failed'))).toBe(false)
    expect(isSdkContextError('SanityInstance context not found')).toBe(false)
  })
})
