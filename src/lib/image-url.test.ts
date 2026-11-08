import {describe, expect, it} from 'vitest'
import {imageUrl} from './image-url'

describe('imageUrl', () => {
  const project = {projectId: 'abc123', dataset: 'production'}

  it('builds a CDN url from an image asset reference', () => {
    expect(imageUrl('image-Tb9Ew8CXIwaY6R1kjMvI0uRR-2000x3000-jpg', project, {width: 1200})).toBe(
      'https://cdn.sanity.io/images/abc123/production/Tb9Ew8CXIwaY6R1kjMvI0uRR-2000x3000.jpg?w=1200&auto=format&fit=max',
    )
  })

  it('returns null for anything that is not an image asset reference', () => {
    expect(imageUrl('file-abc-pdf', project)).toBeNull()
    expect(imageUrl(undefined, project)).toBeNull()
  })
})
