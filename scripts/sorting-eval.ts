/**
 * The Sorting evaluation: runs every paste in fixtures/sorting against Jev and reports, field by
 * field, what was filled correctly, what was left empty that should have been filled, and what
 * was filled wrongly. Run by hand with `pnpm sorting:eval`; it needs AI_GATEWAY_API_KEY in
 * .env.local and costs a fraction of a cent. See docs/sorting-plan.md.
 *
 * Each paste is asked about once. The floors are then tried over the same answers, so the table
 * of floors costs nothing extra.
 */
import {readdirSync, readFileSync, writeFileSync} from 'node:fs'
import {htmlToPortableText} from '@portabletext/html'
import {JSDOM} from 'jsdom'
import {expect, test} from 'vitest'
import {DEFAULT_FLOORS, readAnswers, type SortingAnswer, type SortingFloors} from '../src/sorting/answers'
import {SORTING_VERSION, type SortingField, type SortingRequest, type SortingResponse} from '../src/sorting/contract'
import {edgesOf} from '../src/sorting/edges'
import {jev} from '../src/sorting/jev'
import {buildDecision, questionId} from '../src/sorting/questions'

const FIXTURES = new URL('../fixtures/sorting/', import.meta.url)

/** The Studio the expected results assume, with two fields a piece's text can't settle. */
const FIELDS: SortingField[] = [
  {kind: 'text', name: 'excerpt', title: 'Excerpt', description: 'A short summary shown in lists and search results.'},
  {kind: 'text', name: 'internalNotes', title: 'Internal notes', description: 'Not shown on the site.'},
  {
    kind: 'pick',
    name: 'author',
    title: 'Author',
    many: false,
    options: ['Ana Reis', 'Sam Okafor', 'Priya Nair', 'Tom Becker'].map((label) => ({id: label, label})),
  },
  {
    kind: 'pick',
    name: 'tags',
    title: 'Tags',
    many: true,
    options: ['portugal', 'city breaks', 'budgeting', 'interviews', 'recipes'].map((label) => ({id: label, label})),
  },
  {
    kind: 'pick',
    name: 'categories',
    title: 'Categories',
    many: true,
    options: ['Travel', 'Finance', 'Technology', 'Food', 'Culture'].map((label) => ({id: label, label})),
  },
  {
    kind: 'pick',
    name: 'layout',
    title: 'Layout',
    description: 'How the page is laid out.',
    many: false,
    options: ['Standard', 'Wide', 'Photo essay'].map((label) => ({id: label, label})),
  },
]

interface Capture {
  name: string
  html: string
  text: string
}

interface Expected {
  place: Record<string, string>
  /** `mayAlso`: on a judged pick of several, further answers that are fine but not required. */
  pick: Record<string, {value: string | string[]; kind: 'stated' | 'judged'; mayAlso?: string[]}>
  leavesBody: string[]
  staysInBody: string[]
}

const parseHtml = (html: string) => new JSDOM(html).window.document

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * The blocks the room's editor would make of the paste. It uses `htmlToPortableText` for HTML;
 * for plain text it splits on blank lines first (as `@portabletext/editor`'s text/plain converter
 * does), so Markdown arrives with its marks still in the text.
 */
function blocksOf(capture: Capture): {blocks: Array<{id: string; text: string}>; empty: number} {
  const html =
    capture.html ||
    `<html><body>${escapeHtml(capture.text)
      .split(/\n{2,}/)
      .map((part) => `<p>${part.replace(/\r\n|\r|\n/g, '<br/>')}</p>`)
      .join('')}</body></html>`
  let key = 0
  const converted = htmlToPortableText(html, {parseHtml, keyGenerator: () => `k${++key}`})
  const blocks = converted.flatMap((block) => {
    const children = (block as {children?: Array<{text?: string}>}).children
    return children ? [{id: block._key, text: children.map((child) => child.text ?? '').join('')}] : []
  })
  return {blocks, empty: blocks.filter((block) => !block.text.trim()).length}
}

/** Markdown pasted as plain text keeps its marks; the room will have to strip them when it places a line. */
const unmarked = (text: string) => text.replace(/^#{1,6}\s+/, '').trim()

type Outcome = 'correct' | 'empty' | 'wrong' | 'rightly empty'

const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|')

function score(request: SortingRequest, response: SortingResponse, expected: Expected) {
  const textOf = (id: string) => request.blocks.find((block) => block.id === id)?.text ?? ''
  const outcomes: Record<string, {outcome: Outcome; got: string}> = {}
  const judge = (field: string, want: string[] | undefined, got: string[] | undefined, mayAlso: string[] = []) => {
    const required = got?.filter((value) => !mayAlso.includes(value)) ?? []
    const outcome: Outcome = !want ? (got ? 'wrong' : 'rightly empty') : !got ? 'empty' : sameSet(want, required) ? 'correct' : 'wrong'
    outcomes[field] = {outcome, got: got ? got.join(', ') : '—'}
  }

  judge('title', expected.place.title ? [expected.place.title] : undefined, response.headline ? [unmarked(textOf(response.headline.block))] : undefined)
  for (const field of FIELDS) {
    if (field.kind === 'text') {
      const placed = response.placed.find((entry) => entry.field === field.name)
      const want = expected.place[field.name]
      judge(field.name, want ? [want] : undefined, placed ? [textOf(placed.block)] : undefined)
    } else {
      const picked = response.picked.find((entry) => entry.field === field.name)
      const want = expected.pick[field.name]
      judge(field.name, want ? [want.value].flat() : undefined, picked?.options, want?.mayAlso)
    }
  }

  const removed = [
    ...(response.headline ? [response.headline.block] : []),
    ...response.placed.map((entry) => entry.block),
    ...response.picked.flatMap((entry) => (entry.line ? [entry.line] : [])),
  ].map((id) => unmarked(textOf(id)))
  return {
    outcomes,
    /** Lines taken out of the body that should have stayed: the worst kind of mistake. */
    lost: removed.filter((line) => !expected.leavesBody.includes(line)),
    /** Lines left in the body that should have gone: the Writer deletes them by hand. */
    left: expected.leavesBody.filter((line) => !removed.includes(line)),
  }
}

const names = readdirSync(FIXTURES)
  .filter((file) => file.endsWith('.json') && !file.endsWith('.expected.json'))
  .map((file) => file.replace(/\.json$/, ''))
  .sort()

test('Sorting against the fixtures', async () => {
  expect(process.env.AI_GATEWAY_API_KEY, 'AI_GATEWAY_API_KEY is not set in .env.local').toBeTruthy()
  expect(names.length, 'no fixtures in fixtures/sorting').toBeGreaterThan(0)
  const decide = jev()
  const out: string[] = ['# Sorting evaluation', '', `${names.length} pastes, ${new Date().toISOString()}`, '']
  const runs: Array<{name: string; request: SortingRequest; expected: Expected; answers: Record<string, SortingAnswer | undefined>; confidence?: Record<string, number>}> = []

  out.push('## The pastes', '', '| Paste | Blocks | Empty blocks dropped | Sent (top + foot) | Opening | Questions | Time |', '| --- | --- | --- | --- | --- | --- | --- |')
  for (const name of names) {
    const capture = JSON.parse(readFileSync(new URL(`${name}.json`, FIXTURES), 'utf8')) as Capture
    const expected = JSON.parse(readFileSync(new URL(`${name}.expected.json`, FIXTURES), 'utf8')) as Expected
    const {blocks, empty} = blocksOf(capture)
    const request: SortingRequest = {version: SORTING_VERSION, ...edgesOf(blocks), fields: FIELDS}
    const decision = buildDecision(request)
    const started = Date.now()
    const {answers, confidence} = await decide({...decision, abortSignal: AbortSignal.timeout(30_000)})
    const top = request.blocks.filter((block) => block.edge === 'top').length
    out.push(`| ${name} | ${blocks.length} | ${empty} | ${top} + ${request.blocks.length - top} | ${request.opening.length} chars | ${Object.keys(decision.questions).length} | ${Date.now() - started}ms |`)
    runs.push({name, request, expected, answers, confidence})
  }

  const report = (floors: SortingFloors) =>
    runs.map((run) => ({run, ...score(run.request, readAnswers(run.request, run.answers, {floors, confidence: run.confidence}), run.expected)}))

  const fields = ['title', ...FIELDS.map((field) => field.name)]
  const mark: Record<Outcome, string> = {correct: 'correct', empty: '**empty**', wrong: '**WRONG**', 'rightly empty': '·'}
  const atDefault = report(DEFAULT_FLOORS)
  out.push('', `## At the current floors (${JSON.stringify(DEFAULT_FLOORS)})`, '', `| Paste | ${fields.join(' | ')} | Lost from body | Left in body |`, `| --- | ${fields.map(() => '---').join(' | ')} | --- | --- |`)
  for (const row of atDefault) {
    out.push(`| ${row.run.name} | ${fields.map((field) => mark[row.outcomes[field].outcome]).join(' | ')} | ${row.lost.join('; ') || '·'} | ${row.left.join('; ') || '·'} |`)
  }
  const wrongs = atDefault.flatMap((row) => fields.filter((field) => row.outcomes[field].outcome === 'wrong').map((field) => `- ${row.run.name}, ${field}: got "${row.outcomes[field].got}"`))
  if (wrongs.length > 0) out.push('', 'Wrong fills:', '', ...wrongs)

  out.push('', '## What the model said', '', 'The probability of the answer it chose. "none" means it chose to fill nothing.', '', '| Paste | headline | excerpt | internal notes | byline line | author | author stated | tags line | Travel | layout |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |')
  for (const run of runs) {
    const index = (name: string) => FIELDS.findIndex((field) => field.name === name)
    const cell = (id: string) => {
      const answer = run.answers[id]
      if (!answer) return '?'
      if (answer.type === 'boolean') return answer.probability.toFixed(2)
      const sure = answer.probabilities?.[answer.choice] ?? run.confidence?.[id]
      const label = answer.choice === 'none' ? 'none' : answer.choice.startsWith('b') ? `"${(run.request.blocks[Number(answer.choice.slice(1)) - 1]?.text ?? '?').slice(0, 18)}"` : (FIELDS[Number(id.split(':')[1])] as {options: Array<{label: string}>}).options[Number(answer.choice.slice(1)) - 1]?.label
      return `${label} ${sure === undefined ? '?' : sure.toFixed(2)}`
    }
    out.push(`| ${run.name} | ${cell(questionId.headline)} | ${cell(questionId.place(index('excerpt')))} | ${cell(questionId.place(index('internalNotes')))} | ${cell(questionId.line(index('author')))} | ${cell(questionId.pick(index('author')))} | ${cell(questionId.stated(index('author')))} | ${cell(questionId.line(index('tags')))} | ${cell(questionId.applies(index('categories'), 0))} | ${cell(questionId.pick(index('layout')))} |`)
  }

  out.push('', '## Trying other floors', '', 'All four floors set to the same value, over the same answers. A wrong fill is the outcome to avoid; an empty field is the price.', '', '| Floor | Correct | Empty (should have filled) | Wrong | Lines lost from body | Lines left in body |', '| --- | --- | --- | --- | --- | --- |')
  for (const floor of [0.5, 0.6, 0.7, 0.8, 0.9, 0.95]) {
    const rows = report({place: floor, line: floor, pick: floor, judged: floor})
    const count = (outcome: Outcome) => rows.reduce((sum, row) => sum + fields.filter((field) => row.outcomes[field].outcome === outcome).length, 0)
    out.push(`| ${floor} | ${count('correct')} | ${count('empty')} | ${count('wrong')} | ${rows.reduce((sum, row) => sum + row.lost.length, 0)} | ${rows.reduce((sum, row) => sum + row.left.length, 0)} |`)
  }

  const text = `${out.join('\n')}\n`
  writeFileSync(new URL('report.md', FIXTURES), text)
  console.log(`\n${text}\nSaved to fixtures/sorting/report.md`)
}, 300_000)
