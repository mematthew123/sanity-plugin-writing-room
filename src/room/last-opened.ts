/**
 * The document this Writer last had open in the room, so the Lobby can offer to continue it.
 * Sanity documents don't record who wrote them, so "yours" is what this browser remembers: kept
 * per project and dataset, and only a convenience (private windows or blocked storage just mean
 * the Lobby offers the most recently edited document instead).
 */
export interface LastOpened {
  documentId: string
  documentType: string
}

const key = (projectId: string, dataset: string) =>
  `sanity-plugin-writing-room:last-opened:${projectId}:${dataset}`

export function parseLastOpened(raw: string | null): LastOpened | null {
  try {
    const stored = raw ? (JSON.parse(raw) as Record<string, unknown>) : null
    return stored && typeof stored.documentId === 'string' && typeof stored.documentType === 'string'
      ? {documentId: stored.documentId, documentType: stored.documentType}
      : null
  } catch {
    return null
  }
}

export function readLastOpened(projectId: string, dataset: string): LastOpened | null {
  try {
    return parseLastOpened(window.localStorage.getItem(key(projectId, dataset)))
  } catch {
    return null
  }
}

export function rememberLastOpened(projectId: string, dataset: string, opened: LastOpened): void {
  try {
    window.localStorage.setItem(key(projectId, dataset), JSON.stringify(opened))
  } catch {
    // Storage unavailable: the Lobby falls back to the most recently edited document.
  }
}

export function forgetLastOpened(projectId: string, dataset: string): void {
  try {
    window.localStorage.removeItem(key(projectId, dataset))
  } catch {
    // Nothing to forget.
  }
}
