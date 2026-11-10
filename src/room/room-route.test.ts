import {route} from 'sanity/router'
import {describe, expect, it} from 'vitest'
import {openedDocument, ROOM_ROUTES, roomState} from './room-route'

const router = route.create(
  '/',
  ROOM_ROUTES.map((path) => route.create(path)),
)
const TYPES = ['post', 'caseStudy']

describe('room routes', () => {
  it('keeps the default type at its short URL', () => {
    expect(router.encode(roomState('abc', 'post', TYPES))).toBe('/abc')
    expect(openedDocument(router.decode('/abc') ?? {}, TYPES)).toEqual({
      documentId: 'abc',
      documentType: 'post',
    })
  })

  it('puts the type in the path for any other type', () => {
    expect(router.encode(roomState('abc', 'caseStudy', TYPES))).toBe('/caseStudy/abc')
    expect(openedDocument(router.decode('/caseStudy/abc') ?? {}, TYPES)).toEqual({
      documentId: 'abc',
      documentType: 'caseStudy',
    })
  })

  it('treats the first configured type as the default, whatever it is called', () => {
    expect(router.encode(roomState('abc', 'article', ['article']))).toBe('/abc')
    expect(openedDocument({documentId: 'abc'}, ['article'])).toEqual({
      documentId: 'abc',
      documentType: 'article',
    })
  })

  it('shows the Lobby when no document is open', () => {
    expect(openedDocument(router.decode('/') ?? {}, TYPES)).toBeNull()
  })

  it('refuses a type the room doesn’t write', () => {
    expect(openedDocument({documentId: 'abc', documentType: 'sanity.imageAsset'}, TYPES)).toBeNull()
  })
})
