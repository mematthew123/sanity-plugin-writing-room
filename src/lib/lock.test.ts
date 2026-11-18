import {describe, expect, it} from 'vitest'
import {lockFor, lockNotice, schemaReadOnly, withoutReadOnly} from './lock'
import {NOT_SCHEDULED, type Schedule} from './schedule'

const OPEN = {document: false, title: false, body: false}
const SCHEDULED: Schedule = {
  kind: 'scheduled',
  releaseId: 'rABC',
  publishAt: '2026-11-20T09:00:00.000Z',
}
const STALE: Schedule = {kind: 'stale', releaseId: 'rABC'}
const FIELDS = {title: 'title', body: 'body'}

describe('lockFor', () => {
  it('leaves an ordinary draft open', () => {
    expect(lockFor({schedule: NOT_SCHEDULED, canEdit: true, readOnly: OPEN})).toEqual({
      document: null,
      title: false,
      body: false,
      canUnlock: false,
    })
  })

  it('locks a scheduled document, and lets the Writer unlock it', () => {
    const lock = lockFor({schedule: SCHEDULED, canEdit: true, readOnly: OPEN})
    expect(lock).toEqual({document: 'schedule', title: true, body: true, canUnlock: true})
  })

  it('locks everything for someone who may not change the document', () => {
    const lock = lockFor({schedule: NOT_SCHEDULED, canEdit: false, readOnly: OPEN})
    expect(lock).toEqual({document: 'permission', title: true, body: true, canUnlock: false})
  })

  it('offers no Unlock to someone who may not change a scheduled document', () => {
    const lock = lockFor({schedule: SCHEDULED, canEdit: false, readOnly: OPEN})
    expect(lock.document).toBe('permission')
    expect(lock.canUnlock).toBe(false)
  })

  it('locks everything when the schema makes the document type read-only', () => {
    const lock = lockFor({
      schedule: NOT_SCHEDULED,
      canEdit: true,
      readOnly: {...OPEN, document: true},
    })
    expect(lock).toEqual({document: 'schema', title: true, body: true, canUnlock: false})
  })

  it('still offers Unlock on a scheduled document whose type is read-only', () => {
    const lock = lockFor({schedule: SCHEDULED, canEdit: true, readOnly: {...OPEN, document: true}})
    expect(lock.document).toBe('schedule')
    expect(lock.canUnlock).toBe(true)
  })

  it('locks one field and leaves the other', () => {
    const lock = lockFor({schedule: NOT_SCHEDULED, canEdit: true, readOnly: {...OPEN, title: true}})
    expect(lock).toEqual({document: null, title: true, body: false, canUnlock: false})
  })
})

describe('schemaReadOnly', () => {
  const type = (readOnly: unknown, fieldRules: Record<string, unknown> = {}) => ({
    readOnly,
    fields: ['title', 'body', 'slug'].map((name) => ({name, type: {readOnly: fieldRules[name]}})),
  })

  it('finds nothing locked in a schema without readOnly', () => {
    expect(schemaReadOnly(type(undefined), FIELDS, {}, null)).toEqual(OPEN)
  })

  it('reads a plain readOnly on the type and on each field', () => {
    expect(schemaReadOnly(type(true), FIELDS, {}, null)).toEqual({
      document: true,
      title: false,
      body: false,
    })
    expect(schemaReadOnly(type(false, {body: true}), FIELDS, {}, null)).toEqual({
      ...OPEN,
      body: true,
    })
  })

  it('asks a function about the document, as a Studio workflow does', () => {
    const approved = ({document}: {document?: Record<string, unknown>}) =>
      document?.status === 'approved'
    expect(schemaReadOnly(type(approved), FIELDS, {status: 'draft'}, null).document).toBe(false)
    expect(schemaReadOnly(type(approved), FIELDS, {status: 'approved'}, null).document).toBe(true)
  })

  it('asks a function about the person', () => {
    const editorsOnly = ({currentUser}: {currentUser: {roles: Array<{name: string}>} | null}) =>
      !currentUser?.roles.some((role) => role.name === 'editor')
    const rules = type(undefined, {title: editorsOnly})
    expect(schemaReadOnly(rules, FIELDS, {}, {roles: [{name: 'editor'}]}).title).toBe(false)
    expect(schemaReadOnly(rules, FIELDS, {}, {roles: [{name: 'contributor'}]}).title).toBe(true)
  })

  it('hands a field rule its own value, its parent and its path', () => {
    let seen: unknown
    const rules = type(undefined, {
      title: (context: unknown) => {
        seen = context
        return false
      },
    })
    const document = {title: 'Hello'}
    schemaReadOnly(rules, FIELDS, document, null)
    expect(seen).toEqual({
      document,
      parent: document,
      value: 'Hello',
      currentUser: null,
      path: ['title'],
    })
  })

  it('uses the fields the room detected, whatever they are called', () => {
    const rules = {
      fields: [
        {name: 'headline', type: {readOnly: true}},
        {name: 'content', type: {}},
      ],
    }
    expect(schemaReadOnly(rules, {title: 'headline', body: 'content'}, {}, null)).toEqual({
      ...OPEN,
      title: true,
    })
  })

  it('locks nothing when a rule throws, or when the type is missing', () => {
    const throws = ({document}: {document?: {status: {name: string}}}) =>
      document!.status.name === 'approved'
    expect(schemaReadOnly(type(throws), FIELDS, undefined, null)).toEqual(OPEN)
    expect(schemaReadOnly(undefined, FIELDS, {}, null)).toEqual(OPEN)
  })

  it('only counts a rule that answers true', () => {
    expect(
      schemaReadOnly(
        type(() => 'yes'),
        FIELDS,
        {},
        null,
      ).document,
    ).toBe(false)
  })
})

describe('withoutReadOnly', () => {
  const type = (readOnly: unknown, fieldRules: Record<string, unknown> = {}) => ({
    readOnly,
    fields: ['title', 'slug', 'publishedAt'].map((name) => ({name, type: {readOnly: fieldRules[name]}})),
  })
  const patch = {slug: {current: 'hello'}, publishedAt: '2026-11-18T12:00:00.000Z'}

  it('leaves a patch alone where nothing is read-only', () => {
    expect(withoutReadOnly(patch, type(undefined), {}, null)).toEqual(patch)
  })

  it('writes nothing to a read-only document type', () => {
    expect(withoutReadOnly(patch, type(true), {}, null)).toEqual({})
    const approved = ({document}: {document?: Record<string, unknown>}) => document?.status === 'approved'
    expect(withoutReadOnly(patch, type(approved), {status: 'approved'}, null)).toEqual({})
    expect(withoutReadOnly(patch, type(approved), {status: 'draft'}, null)).toEqual(patch)
  })

  it('leaves out only the field that is read-only', () => {
    expect(withoutReadOnly(patch, type(undefined, {slug: true}), {}, null)).toEqual({
      publishedAt: patch.publishedAt,
    })
  })

  it('doesn’t mind a locked title or body: publishing never writes them', () => {
    expect(withoutReadOnly(patch, type(undefined, {title: true}), {}, null)).toEqual(patch)
  })
})

describe('lockNotice', () => {
  const lock = (overrides: Parameters<typeof lockFor>[0] | object = {}) =>
    lockFor({schedule: NOT_SCHEDULED, canEdit: true, readOnly: OPEN, ...overrides})

  it('says nothing where typing is welcome', () => {
    expect(lockNotice(lock(), NOT_SCHEDULED, 'post', 'body')).toBeNull()
  })

  it('says how to change a scheduled document', () => {
    expect(lockNotice(lock({schedule: SCHEDULED}), SCHEDULED, 'post', 'body')).toBe(
      'This post is scheduled. Unlock it to make changes.',
    )
    expect(lockNotice(lock({schedule: STALE}), STALE, 'post', 'title')).toBe(
      'This post is locked. Unlock it to make changes.',
    )
  })

  it('offers no Unlock to someone who can only read', () => {
    expect(lockNotice(lock({schedule: SCHEDULED, canEdit: false}), SCHEDULED, 'post', 'body')).toBe(
      'You can read this post here, but not change it.',
    )
  })

  it('says a read-only document isn’t open for changes', () => {
    expect(
      lockNotice(lock({readOnly: {...OPEN, document: true}}), NOT_SCHEDULED, 'case study', 'body'),
    ).toBe('This case study isn’t open for changes right now.')
  })

  it('names the one field that is locked, and only when typing lands there', () => {
    const titleOnly = lock({readOnly: {...OPEN, title: true}})
    expect(lockNotice(titleOnly, NOT_SCHEDULED, 'post', 'title')).toBe(
      'This post’s title isn’t open for changes right now.',
    )
    expect(lockNotice(titleOnly, NOT_SCHEDULED, 'post', 'body')).toBeNull()
  })
})
