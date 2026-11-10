import {describe, expect, it} from 'vitest'
import {publishProblems} from './publish-problems'

const error = (path: unknown[], message: string) => ({level: 'error' as const, path, message})

describe('publishProblems', () => {
  it('ignores warnings: they never block a publish', () => {
    expect(publishProblems([{level: 'warning', path: ['excerpt'], message: 'Short'}])).toEqual([])
  })

  it('points title errors at the title', () => {
    expect(publishProblems([error(['title'], 'Every Post needs a title.')])).toEqual([
      {target: {kind: 'title'}, message: 'Every Post needs a title.'},
    ])
  })

  it('points an empty body at the body', () => {
    expect(publishProblems([error(['body'], 'Write something before publishing.')])[0]?.target).toEqual({kind: 'body'})
  })

  it('points a field inside a body object at that field', () => {
    expect(publishProblems([error(['body', {_key: 'img1'}, 'alt'], 'Describe this image')])[0]?.target).toEqual({
      kind: 'block',
      key: 'img1',
      field: 'alt',
    })
  })

  it('points a bad link at the paragraph that holds it', () => {
    expect(
      publishProblems([error(['body', {_key: 'p1'}, 'markDefs', {_key: 'm1'}, 'href'], 'Links need…')])[0]?.target,
    ).toEqual({kind: 'block', key: 'p1'})
  })

  it('keeps the order the Writer would meet them: title first, then the body top to bottom', () => {
    const problems = publishProblems([
      error(['body', {_key: 'b'}, 'alt'], 'second'),
      error(['title'], 'first'),
    ])
    expect(problems.map((p) => p.message)).toEqual(['first', 'second'])
  })

  it('finds the title and body under the type’s own field names', () => {
    const fields = {title: 'headline', body: 'content'}
    expect(publishProblems([error(['headline'], 'Needs a headline.')], fields)[0]?.target).toEqual({kind: 'title'})
    expect(publishProblems([error(['content', {_key: 'p1'}], 'Too long.')], fields)[0]?.target).toEqual({
      kind: 'block',
      key: 'p1',
    })
    expect(publishProblems([error(['body'], 'Unrelated.')], fields)[0]?.target).toEqual({kind: 'details'})
  })
})
