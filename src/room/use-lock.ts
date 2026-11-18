import {
  type DocumentHandle,
  type DocumentPermissionsResult,
  editDocument,
  getDocumentState,
  publishDocument,
  useDocumentPermissions,
  useSanityInstance,
} from '@sanity/sdk-react'
import {useCallback, useMemo, useSyncExternalStore} from 'react'
import {useCurrentUser, useSchema} from 'sanity'
import {lockFor, type RoomLock, schemaReadOnly, type SchemaReadOnly} from '../lib/lock'
import {type Schedule} from '../lib/schedule'
import {type WritingFields} from './fields'

/** Refused for who is asking, not for the state the document is in (nothing to publish, say). */
const refused = (permission: DocumentPermissionsResult) =>
  !permission.allowed && permission.reasons.some((reason) => reason.type === 'access')

const encode = ({document, title, body}: SchemaReadOnly) => `${+document}${+title}${+body}`
const decode = (bits: string): SchemaReadOnly => ({
  document: bits[0] === '1',
  title: bits[1] === '1',
  body: bits[2] === '1',
})

/**
 * The schema's `readOnly` for the document as it is shown. The rules can depend on the document,
 * which changes with every keystroke, so the room only hears when an answer changes.
 */
function useSchemaReadOnly(shown: DocumentHandle, fields: WritingFields): SchemaReadOnly {
  const instance = useSanityInstance()
  const schemaType = useSchema().get(shown.documentType)
  const currentUser = useCurrentUser()
  const source = useMemo(
    () => getDocumentState<Record<string, unknown>>(instance, shown),
    [instance, shown],
  )
  const read = useCallback(
    () => encode(schemaReadOnly(schemaType, fields, source.getCurrent() ?? undefined, currentUser)),
    [schemaType, fields, source, currentUser],
  )
  const bits = useSyncExternalStore(source.subscribe, read)
  return useMemo(() => decode(bits), [bits])
}

/**
 * What in the room takes no changes, and why: the Writer's role, a schedule, or the Studio's
 * schema. Suspends until the Writer's permissions are known.
 */
export function useRoomLock(
  handle: DocumentHandle,
  shown: DocumentHandle,
  schedule: Schedule,
  fields: WritingFields,
): RoomLock & {canPublish: boolean} {
  const edit = useMemo(() => editDocument(handle), [handle])
  const publish = useMemo(() => publishDocument(handle), [handle])
  const canEdit = !refused(useDocumentPermissions(edit))
  const canPublish = !refused(useDocumentPermissions(publish))
  const readOnly = useSchemaReadOnly(shown, fields)
  return useMemo(
    () => ({...lockFor({schedule, canEdit, readOnly}), canPublish}),
    [schedule, canEdit, readOnly, canPublish],
  )
}
