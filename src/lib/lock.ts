import {type Schedule} from './schedule'

/** What the Studio's schema says can't be changed, for this document and this person, right now. */
export interface SchemaReadOnly {
  document: boolean
  title: boolean
  body: boolean
}

export interface RoomLock {
  /**
   * Why the whole document takes no changes, or null when it does:
   *
   * - `permission`: this person's role doesn't let them change it;
   * - `schedule`: it's on a schedule, and shows what will go live;
   * - `schema`: the document type is `readOnly` in the Studio's schema.
   */
  document: 'permission' | 'schedule' | 'schema' | null
  /** The title takes no changes: the whole document is locked, or the schema locks this field. */
  title: boolean
  body: boolean
  /** Only a schedule is the Writer's own to lift, and only if they may change the document. */
  canUnlock: boolean
}

/** The first reason that applies is the one the room gives; a reason the Writer can't lift comes first. */
export function lockFor({
  schedule,
  canEdit,
  readOnly,
}: {
  schedule: Schedule
  canEdit: boolean
  readOnly: SchemaReadOnly
}): RoomLock {
  const document = !canEdit
    ? 'permission'
    : schedule.kind !== 'none'
      ? 'schedule'
      : readOnly.document
        ? 'schema'
        : null
  const whole = document !== null
  return {
    document,
    title: whole || readOnly.title,
    body: whole || readOnly.body,
    canUnlock: document === 'schedule',
  }
}

type ReadOnlyRule = boolean | ((context: ReadOnlyContext) => boolean) | undefined

interface ReadOnlyContext {
  document: Record<string, unknown> | undefined
  parent: unknown
  value: unknown
  currentUser: unknown
  path: Array<string>
}

interface TypeWithReadOnly {
  readOnly?: unknown
  fields?: ReadonlyArray<{name: string; type: {readOnly?: unknown}}>
}

/** A rule that throws (on a document that hasn't loaded, say) locks nothing. */
function applies(rule: unknown, context: ReadOnlyContext): boolean {
  const readOnly = rule as ReadOnlyRule
  if (typeof readOnly !== 'function') return readOnly === true
  try {
    return readOnly(context) === true
  } catch {
    return false
  }
}

/**
 * The schema's `readOnly` for the document type and for its title and body, resolved as the
 * Studio's form resolves them: a boolean, or a function of the document and the current user.
 */
export function schemaReadOnly(
  schemaType: TypeWithReadOnly | undefined,
  fields: {title: string; body: string},
  document: Record<string, unknown> | undefined,
  currentUser: unknown,
): SchemaReadOnly {
  const whole = applies(schemaType?.readOnly, {
    document,
    parent: undefined,
    value: document,
    currentUser,
    path: [],
  })
  const field = (name: string) =>
    applies(schemaType?.fields?.find((candidate) => candidate.name === name)?.type.readOnly, {
      document,
      parent: document,
      value: document?.[name],
      currentUser,
      path: [name],
    })
  return {document: whole, title: field(fields.title), body: field(fields.body)}
}

/**
 * A patch with every field the schema makes read-only left out, and nothing at all for a
 * read-only document type. Publishing settles a slug and stamps a date; a lock is still a lock,
 * so the room writes neither where the Studio's form wouldn't let the Writer.
 */
export function withoutReadOnly<Value>(
  patch: Record<string, Value>,
  schemaType: TypeWithReadOnly | undefined,
  document: Record<string, unknown> | undefined,
  currentUser: unknown,
): Record<string, Value> {
  const names = Object.keys(patch)
  if (names.length === 0) return patch
  if (applies(schemaType?.readOnly, {document, parent: undefined, value: document, currentUser, path: []})) {
    return {}
  }
  const writable: Record<string, Value> = {}
  for (const name of names) {
    const rule = schemaType?.fields?.find((candidate) => candidate.name === name)?.type.readOnly
    const locked = applies(rule, {document, parent: document, value: document?.[name], currentUser, path: [name]})
    if (!locked) writable[name] = patch[name] as Value
  }
  return writable
}

/**
 * The one line typing gets when it lands somewhere that takes no changes, or null where it's
 * welcome. Voice per DESIGN.md.
 */
export function lockNotice(
  lock: RoomLock,
  schedule: Schedule,
  singular: string,
  where: 'title' | 'body',
): string | null {
  switch (lock.document) {
    case 'permission':
      return `You can read this ${singular} here, but not change it.`
    case 'schedule':
      return schedule.kind === 'scheduled'
        ? `This ${singular} is scheduled. Unlock it to make changes.`
        : `This ${singular} is locked. Unlock it to make changes.`
    case 'schema':
      return `This ${singular} isn’t open for changes right now.`
    case null:
      return lock[where] ? `This ${singular}’s ${where} isn’t open for changes right now.` : null
  }
}
