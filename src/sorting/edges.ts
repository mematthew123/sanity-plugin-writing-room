import {type SortingBlock} from './contract'

/**
 * Sorting reads a piece from its edges: headlines, bylines and standfirsts are at the top, tags
 * and notes about the author at the top or the foot. Every paste is read this way, so a long piece
 * costs and takes the same as a short one. These sizes are starting guesses.
 */
export const EDGES = {
  top: 12,
  bottom: 4,
  /** Characters of running text after the top edge, for picks judged by what the piece is about. */
  opening: 2000,
} as const

/** The blocks to ask about and the opening to judge by. Empty blocks count for nothing. */
export function edgesOf(pasted: Array<{id: string; text: string}>): {blocks: SortingBlock[]; opening: string} {
  const written = pasted.map((block) => ({id: block.id, text: block.text.trim()})).filter((block) => block.text)
  const top = written.slice(0, EDGES.top)
  const rest = written.slice(EDGES.top)
  const bottom = rest.slice(-EDGES.bottom)
  const between = rest.slice(0, Math.max(0, rest.length - EDGES.bottom))
  return {
    blocks: [
      ...top.map((block) => ({...block, edge: 'top' as const})),
      ...bottom.map((block) => ({...block, edge: 'bottom' as const})),
    ],
    opening: between
      .map((block) => block.text)
      .join('\n\n')
      .slice(0, EDGES.opening),
  }
}
