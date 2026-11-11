import {describe, expect, it} from 'vitest'
import {parseLastOpened} from './last-opened'

describe('parseLastOpened', () => {
  it('reads back a remembered document', () => {
    expect(parseLastOpened('{"documentId":"a","documentType":"post"}')).toEqual({
      documentId: 'a',
      documentType: 'post',
    })
  })

  it.each([null, '', 'not json', '{}', '{"documentId":1,"documentType":"post"}', '[]', 'null'])(
    'is nothing for %j',
    (raw) => {
      expect(parseLastOpened(raw)).toBeNull()
    },
  )
})
