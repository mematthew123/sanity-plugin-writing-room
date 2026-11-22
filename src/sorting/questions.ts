import {type SortingField, type SortingRequest} from './contract'

/**
 * The questions Sorting puts to the model, and the shared state they are asked about. The model
 * only ever chooses among answers given here (a pasted block, an existing option, yes or no), so
 * nothing it returns can be text the Writer didn't write.
 * See docs/adr/0003-sorting-places-and-picks-but-never-writes.md.
 */
export type SortingQuestion =
  | {type: 'choice'; instructions: string; criteria: Record<string, string>}
  | {type: 'boolean'; instructions: string}

export interface SortingDecision {
  state: {top: Record<string, string>; bottom: Record<string, string>; opening: string}
  questions: Record<string, SortingQuestion>
}

/** The answer every Choice offers, so the model is never forced to pick something. */
export const NONE = 'none'

/** Blocks and options are named by position, so ids from the room never reach the model. */
export const blockName = (index: number) => `b${index + 1}`
export const optionName = (index: number) => `o${index + 1}`

export const questionId = {
  headline: 'headline',
  place: (field: number) => `place:${field}`,
  line: (field: number) => `line:${field}`,
  pick: (field: number) => `pick:${field}`,
  stated: (field: number) => `stated:${field}`,
  applies: (field: number, option: number) => `applies:${field}:${option}`,
}

const clip = (text: string, max = 160) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

function describe(field: SortingField): string {
  return field.description
    ? `the field "${field.title}" (described as: "${field.description}")`
    : `the field "${field.title}"`
}

const STATE =
  'The state is a piece of writing pasted from another editor. `top` holds its first blocks in order and `bottom` its last, each under a short name; `opening` is the running text that follows the top blocks.'

export function buildDecision(request: SortingRequest): SortingDecision {
  const top: Record<string, string> = {}
  const bottom: Record<string, string> = {}
  const everyBlock: Record<string, string> = {}
  const topBlocks: Record<string, string> = {}
  request.blocks.forEach((block, index) => {
    const name = blockName(index)
    ;(block.edge === 'top' ? top : bottom)[name] = block.text
    everyBlock[name] = clip(block.text)
    if (block.edge === 'top') topBlocks[name] = clip(block.text)
  })

  const questions: Record<string, SortingQuestion> = {}

  if (Object.keys(topBlocks).length > 0) {
    questions[questionId.headline] = {
      type: 'choice',
      instructions: `${STATE} Which block in \`top\` is the headline of the whole piece: its title? A section heading, a byline, a one-line summary and the first sentence of the running text are not the headline.`,
      criteria: {
        ...topBlocks,
        [NONE]: 'No block is the headline. The piece was pasted without its title.',
      },
    }
  }

  request.fields.forEach((field, index) => {
    if (field.kind === 'text') {
      questions[questionId.place(index)] = {
        type: 'choice',
        instructions: `${STATE} A document has ${describe(field)}. Which block, if any, was written to be that field's value and stands apart from the running text? The headline, a byline, a label line such as "Tags: …" and paragraphs of the running text are not it.`,
        criteria: {
          ...everyBlock,
          [NONE]: `No block was written as the ${field.title}. Every block is the headline, a byline, a label line or part of the running text.`,
        },
      }
      return
    }

    questions[questionId.line(index)] = {
      type: 'choice',
      instructions: `${STATE} A document has ${describe(field)}. Which block, if any, is a label line that does nothing but state it, such as "By Jane Doe" for an author or "Category: News" for a category? A sentence of prose that happens to mention it is not a label line.`,
      criteria: {
        ...everyBlock,
        [NONE]: `No block is a label line for the ${field.title}.`,
      },
    }

    if (field.many) {
      field.options.forEach((option, optionIndex) => {
        questions[questionId.applies(index, optionIndex)] = {
          type: 'boolean',
          instructions: `${STATE} A document has ${describe(field)}, which takes several answers. Is "${option.label}" clearly one of them for this piece, going by what the piece is mainly about?`,
        }
      })
      return
    }

    const options: Record<string, string> = {}
    field.options.forEach((option, optionIndex) => {
      options[optionName(optionIndex)] = option.label
    })
    questions[questionId.pick(index)] = {
      type: 'choice',
      instructions: `${STATE} A document has ${describe(field)}, which takes one of the answers listed. Which is right for this piece? Go first by what the piece states outright (a byline, a label line, a note about the author), then by what the piece is about.`,
      criteria: {
        ...options,
        [NONE]: `None of these is clearly the ${field.title} of this piece, or the piece gives no way to tell.`,
      },
    }
    questions[questionId.stated(index)] = {
      type: 'boolean',
      instructions: `${STATE} A document has ${describe(field)}. Does the piece state it outright, by name, in a byline, a label line or a note, as opposed to leaving it to be inferred from the subject?`,
    }
  })

  return {state: {top, bottom, opening: request.opening}, questions}
}
