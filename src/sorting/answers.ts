import {SORTING_VERSION, type SortingPickField, type SortingRequest, type SortingResponse} from './contract'
import {blockName, NONE, optionName, questionId} from './questions'

export type SortingAnswer =
  | {type: 'choice'; choice: string; probabilities?: Record<string, number>}
  | {type: 'boolean'; probability: number}

/**
 * How sure the model must be before Sorting acts. Under a floor the field stays empty and the
 * line stays in the body: an empty field shows, a wrong one doesn't.
 *
 * These are starting guesses. They are to be set from the fixtures in fixtures/sorting, where
 * wrong fills are near zero. See docs/sorting-plan.md.
 */
export interface SortingFloors {
  /** A block is the headline, or a text field's value. */
  place: number
  /** A block is a label line. */
  line: number
  /** A pick the paste states. */
  pick: number
  /** A pick that follows from what the piece is about. */
  judged: number
}

export const DEFAULT_FLOORS: SortingFloors = {place: 0.8, line: 0.8, pick: 0.8, judged: 0.9}

/** The most answers a judged pick fills in a field that takes several. */
const MOST_JUDGED = 5

type Answers = Record<string, SortingAnswer | undefined>

interface Chosen {
  /** Index into the request's blocks or the field's options. */
  index: number
  confidence: number
}

function chosen(
  answers: Answers,
  confidence: Record<string, number> | undefined,
  id: string,
  name: (index: number) => string,
  count: number,
): Chosen | null {
  const answer = answers[id]
  if (answer?.type !== 'choice' || answer.choice === NONE) return null
  for (let index = 0; index < count; index++) {
    if (name(index) !== answer.choice) continue
    // Without a probability the answer can't be held to a floor, so it counts for nothing.
    return {index, confidence: answer.probabilities?.[answer.choice] ?? confidence?.[id] ?? 0}
  }
  return null
}

function probability(answers: Answers, id: string): number {
  const answer = answers[id]
  return answer?.type === 'boolean' ? answer.probability : 0
}

/** The items a label line lists after its colon: "Tags: portugal, city breaks". */
export function itemsInLine(line: string): string[] {
  const colon = line.indexOf(':')
  if (colon === -1) return []
  const items = line
    .slice(colon + 1)
    .split(/[,;]/)
    .map((item) => item.trim().replace(/^#/, ''))
    .filter(Boolean)
  return items.filter((item, index) => items.findIndex((other) => other.toLowerCase() === item.toLowerCase()) === index)
}

/**
 * The answers a label line names, read by code: "Tags: portugal, city breaks" against the field's
 * own options. `whole` is false when the line names something the field doesn't offer.
 */
export function namedInLine(line: string, field: SortingPickField): {options: string[]; whole: boolean} {
  const named = itemsInLine(line).map((item) => item.toLowerCase())
  const options: string[] = []
  let whole = named.length > 0
  for (const item of named) {
    const match = field.options.find((option) => option.label.trim().toLowerCase() === item)
    if (match && !options.includes(match.id)) options.push(match.id)
    if (!match) whole = false
  }
  return {options, whole}
}

/** Whether a label line names an answer, read by code: "By Sam Okafor" names "Sam Okafor". */
export function namesOption(line: string, label: string): boolean {
  const plain = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  const wanted = plain(label)
  return wanted !== '' && ` ${plain(line)} `.includes(` ${wanted} `)
}

type Picked = SortingResponse['picked'][number]
type Claim = {block: number; confidence: number} & (
  | {what: 'headline'}
  | {what: 'place' | 'line'; field: number}
  | {what: 'list'; field: number; values: string[]}
)

/** Turns the model's answers into what the room should do, holding each to its floor. */
export function readAnswers(
  request: SortingRequest,
  answers: Answers,
  options: {floors?: Partial<SortingFloors>; confidence?: Record<string, number>} = {},
): SortingResponse {
  const floors = {...DEFAULT_FLOORS, ...options.floors}
  const {confidence} = options
  const blocks = request.blocks.length
  const claims: Claim[] = []
  const picked = new Map<number, Picked>()

  const headline = chosen(answers, confidence, questionId.headline, blockName, blocks)
  if (headline && headline.confidence >= floors.place && request.blocks[headline.index].edge === 'top') {
    claims.push({what: 'headline', block: headline.index, confidence: headline.confidence})
  }

  request.fields.forEach((field, index) => {
    if (field.kind === 'text') {
      const place = chosen(answers, confidence, questionId.place(index), blockName, blocks)
      if (place && place.confidence >= floors.place) {
        claims.push({what: 'place', field: index, block: place.index, confidence: place.confidence})
      }
      return
    }

    const found = chosen(answers, confidence, questionId.line(index), blockName, blocks)
    const line = found && found.confidence >= floors.line ? found : null

    if (field.kind === 'list') {
      const values = line ? itemsInLine(request.blocks[line.index].text) : []
      if (line && values.length > 0) {
        claims.push({what: 'list', field: index, block: line.index, confidence: line.confidence, values})
      }
      return
    }

    if (field.many) {
      const named = line ? namedInLine(request.blocks[line.index].text, field) : null
      if (line && named && named.options.length > 0) {
        picked.set(index, {field: field.name, options: named.options, kind: 'stated', line: null, confidence: line.confidence})
        // The line only leaves the body when every answer it names was picked.
        if (named.whole) claims.push({what: 'line', field: index, block: line.index, confidence: line.confidence})
        return
      }
      const judged = field.options
        .map((option, optionIndex) => ({id: option.id, sure: probability(answers, questionId.applies(index, optionIndex))}))
        .filter((option) => option.sure >= floors.judged)
        .sort((a, b) => b.sure - a.sure)
        .slice(0, MOST_JUDGED)
      if (judged.length > 0) {
        picked.set(index, {
          field: field.name,
          options: judged.map((option) => option.id),
          kind: 'judged',
          line: null,
          confidence: Math.min(...judged.map((option) => option.sure)),
        })
      }
      return
    }

    const pick = chosen(answers, confidence, questionId.pick(index), optionName, field.options.length)
    if (!pick) return
    // A label line only states the pick when it names it: "By Dana Whitfield" says nothing for Sam Okafor.
    const names = line !== null && namesOption(request.blocks[line.index].text, field.options[pick.index].label)
    // A line that names someone else is what the piece states, so the pick can only be a judged one.
    const stated = line !== null ? names : probability(answers, questionId.stated(index)) >= 0.5
    if (pick.confidence < (stated ? floors.pick : floors.judged)) return
    // A page layout has an answer that sounds like a default; the text of a piece doesn't settle it.
    if (!stated && probability(answers, questionId.settled(index)) < 0.5) return
    picked.set(index, {
      field: field.name,
      options: [field.options[pick.index].id],
      kind: stated ? 'stated' : 'judged',
      line: null,
      confidence: pick.confidence,
    })
    if (line && names) claims.push({what: 'line', field: index, block: line.index, confidence: line.confidence})
  })

  // Every block ends up in one place: the surest claim on it wins, and the headline wins a tie.
  claims.sort((a, b) => b.confidence - a.confidence || Number(b.what === 'headline') - Number(a.what === 'headline'))
  const taken = new Set<number>()
  const response: SortingResponse = {version: SORTING_VERSION, headline: null, placed: [], picked: [], listed: []}
  for (const claim of claims) {
    if (taken.has(claim.block)) continue
    taken.add(claim.block)
    const block = request.blocks[claim.block].id
    if (claim.what === 'headline') {
      response.headline = {block, confidence: claim.confidence}
    } else if (claim.what === 'place') {
      response.placed.push({field: request.fields[claim.field].name, block, confidence: claim.confidence})
    } else if (claim.what === 'list') {
      response.listed.push({field: request.fields[claim.field].name, values: claim.values, line: block, confidence: claim.confidence})
    } else {
      const pick = picked.get(claim.field)
      if (pick) pick.line = block
    }
  }

  // In the order the room listed the fields.
  response.placed.sort(
    (a, b) => request.fields.findIndex((f) => f.name === a.field) - request.fields.findIndex((f) => f.name === b.field),
  )
  response.picked = [...picked.entries()].sort(([a], [b]) => a - b).map(([, pick]) => pick)
  return response
}
