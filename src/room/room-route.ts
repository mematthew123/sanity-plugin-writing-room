/**
 * The default type opens at `/writing-room/<id>`; other types carry their type in the path,
 * since the room needs it before it can load the document.
 */
export type RoomState = {
  documentId: string
  documentType?: string
}

export const ROOM_ROUTES = ['/:documentId', '/:documentType/:documentId'] as const

/** `types` are the room's types, default first. */
export function roomState(documentId: string, documentType: string, types: readonly string[]): RoomState {
  return documentType === types[0] ? {documentId} : {documentId, documentType}
}

/** Null for the Lobby. */
export function openedDocument(
  state: Record<string, unknown>,
  types: readonly string[],
): {documentId: string; documentType: string} | null {
  const {documentId, documentType} = state
  if (typeof documentId !== 'string' || !documentId) return null
  if (documentType === undefined) return {documentId, documentType: types[0]!}
  return typeof documentType === 'string' && types.includes(documentType)
    ? {documentId, documentType}
    : null
}
