/**
 * Before a Studio's action runs, the room reads the saved draft's revision and waits for the
 * Studio's store to reach it. A read belongs to one lookup: the lookup started for the room's
 * sync state and the Studio's draft as they were then. When either changes a new lookup starts,
 * and what the old one read says nothing about the new state, even if a revision happens to match.
 */
export interface SavedRead {
  /** The lookup that made this read. Compared by identity. */
  lookup: object
  /** The saved draft's revision, or null when there was no draft. */
  revision: string | null
}

/**
 * Whether a read lets the waiting action run: it came from the lookup now under way, and the
 * Studio's draft is the revision it read.
 */
export function readLetsActionRun(
  read: SavedRead | null,
  currentLookup: object | null,
  draftRevision: string | null,
): boolean {
  return read !== null && read.lookup === currentLookup && read.revision === draftRevision
}
