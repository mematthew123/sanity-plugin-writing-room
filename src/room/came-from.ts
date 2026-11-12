/**
 * Where the Writer was before the room, so Leave can take them back there: a document opened
 * from its form (the "Open in Writing Room" action) returns to that form; anything else returns
 * to the Lobby. Remembered for this page only: after a reload, Leave goes to the Lobby.
 */
let fromForm: string | null = null

export function cameFromForm(documentId: string): void {
  fromForm = documentId
}

export function didComeFromForm(documentId: string): boolean {
  return fromForm === documentId
}

/** Once the Writer has been through the Lobby, that's where they came from. */
export function cameFromLobby(): void {
  fromForm = null
}
