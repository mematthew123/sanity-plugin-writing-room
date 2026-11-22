/**
 * `sanity-plugin-writing-room/sorting`: the server side of Sorting, for a route the Studio's
 * owner hosts. Experimental. It needs the `ai` package installed beside it.
 *
 * ```ts
 * // app/api/sort/route.ts
 * import {createSortingHandler} from 'sanity-plugin-writing-room/sorting'
 *
 * export const POST = createSortingHandler({projectId: 'abc123'})
 * ```
 */
import {type SortingFloors} from './answers'
import {createSortingRoute, type SortingDecide, type SortingHandlerOptions} from './handler'
import {jev} from './jev'

export interface CreateSortingHandlerOptions extends Omit<SortingHandlerOptions, 'decide'> {
  /** Defaults to Jev through Vercel AI Gateway. */
  decide?: SortingDecide
}

export function createSortingHandler(options: CreateSortingHandlerOptions) {
  return createSortingRoute({...options, decide: options.decide ?? jev()})
}

export {jev, JEV} from './jev'
export {DEFAULT_FLOORS} from './answers'
export {SORTING_VERSION} from './contract'
export type {SortingDecide, SortingFloors}
export type {SortingAnswer} from './answers'
export type {
  SortingBlock,
  SortingField,
  SortingOption,
  SortingPickField,
  SortingRequest,
  SortingResponse,
  SortingTextField,
} from './contract'
export type {SortingDecision, SortingQuestion} from './questions'
