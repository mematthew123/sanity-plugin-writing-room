/**
 * The default type opens at `/writing-room/<id>`; other types carry their type in the path,
 * since the room needs it before it can load the document.
 */
export type RoomState = {
  documentId: string
  documentType?: string
  _searchParams?: [string, string][]
}

export const ROOM_ROUTES = ['/:documentId', '/:documentType/:documentId'] as const

/**
 * `types` are the room's types, default first. `release` is the Release whose copy of the document
 * to open, when the Writer came from Structure with one chosen; it rides in the query, like the view.
 */
export function roomState(
  documentId: string,
  documentType: string,
  types: readonly string[],
  release?: string,
): RoomState {
  return {
    documentId,
    ...(documentType !== types[0] && {documentType}),
    ...(release && {_searchParams: [['release', release]]}),
  }
}

/** Details is a view of the open document, kept in the query so both URL shapes stay as they are. */
export function detailsState(room: RoomState, field?: string): RoomState & {_searchParams: [string, string][]} {
  const view: [string, string][] = field ? [['view', 'details'], ['field', field]] : [['view', 'details']]
  return {...room, _searchParams: [...(room._searchParams ?? []), ...view]}
}

/** The Release whose copy was asked for, if one was. */
export function openedRelease(state: Record<string, unknown>): string | undefined {
  const params = Array.isArray(state._searchParams) ? (state._searchParams as [string, string][]) : []
  return params.find(([name]) => name === 'release')?.[1] || undefined
}

/** Which view of the open document, and the Details field to go to, if one was asked for. */
export function openedView(state: Record<string, unknown>): {details: boolean; field?: string} {
  const params = new Map(Array.isArray(state._searchParams) ? (state._searchParams as [string, string][]) : [])
  if (params.get('view') !== 'details') return {details: false}
  return {details: true, field: params.get('field') || undefined}
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
