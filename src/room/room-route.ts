/**
 * The Writing Room's router state for one document. The default type (the first in `types`)
 * opens at `/writing-room/<id>`, so a Studio with one type keeps short URLs and existing links
 * still open; other types carry their type in the path, `/writing-room/caseStudy/<id>`, since the
 * room needs the type before it can load the document.
 */
export type RoomState = {
  documentId: string
  documentType?: string
}

export const ROOM_ROUTES = ['/:documentId', '/:documentType/:documentId'] as const

/** The state that opens `documentId` in the room. `types` are the room's types, default first. */
export function roomState(documentId: string, documentType: string, types: readonly string[]): RoomState {
  return documentType === types[0] ? {documentId} : {documentId, documentType}
}

/** Reads the room's state back: the document to open, or null for the Lobby. */
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
