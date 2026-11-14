/**
 * Where turning an expired promise back into a draft has got to. Folding takes away the copy the
 * Writer may be typing in, so it goes in steps: wait until the room is saved (`saving`), hold the
 * page still (`hold`, then `held` if something was typed in between), and only then `fold`.
 */
export type FoldPhase = 'none' | 'saving' | 'hold' | 'held' | 'fold'

export function foldPhase({
  release,
  expired,
  synced,
  held,
  leftAsIs,
}: {
  /** The settled release, if the Post has one. */
  release: string | null
  expired: boolean
  /** Everything typed in the room has been saved. */
  synced: boolean
  /** The release the page is being held still for. */
  held: string | null
  /** A release whose fold was given up on, until the next visit. */
  leftAsIs: string | null
}): FoldPhase {
  if (!release || !expired || leftAsIs === release) return 'none'
  if (held !== release) return synced ? 'hold' : 'saving'
  return synced ? 'fold' : 'held'
}

/** Nothing can be typed from the moment the page is held until the copy is gone. */
export const isFolding = (phase: FoldPhase) => phase === 'held' || phase === 'fold'
