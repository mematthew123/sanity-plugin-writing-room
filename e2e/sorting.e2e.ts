import {randomUUID} from 'node:crypto'
import {type Page} from '@playwright/test'
import {type SortingRequest, type SortingResponse} from '../src/sorting/contract'
import {ID_PREFIX} from './content'
import {expect, expectDraft, test as base, type TestPost} from './fixtures'
import {Room} from './room'

const HEADLINE = 'A Week in Lisbon'
const STANDFIRST = 'Seven days, four neighbourhoods and one very steep tram.'
const DAYS = Array.from(
  {length: 4},
  (_, index) =>
    `Day ${index + 1}. The tram climbed the hill past tiled houses while the river turned gold below us, and nobody on board said a word. By the evening we had walked further than we planned, eaten later than we meant to, and agreed to do the same again tomorrow.`,
)

interface Piece {
  /** A Field Note with no title, no body and nothing in Details. */
  note: TestPost
  /** A published Topic for the note's Topics to pick. */
  topic: {id: string; title: string}
  /** The paste: a headline, a standfirst, a label line naming the topic, then the piece. */
  blocks: string[]
}

const test = base.extend<{piece: Piece}>({
  piece: async ({content, makePost, page}, provide) => {
    const topic = {id: `${ID_PREFIX}${randomUUID()}`, title: `Travel ${randomUUID().slice(0, 8)}`}
    await content.create({_id: topic.id, _type: 'topic', title: topic.title})
    const note = await makePost({type: 'fieldNote', paragraphs: 0, fields: {title: ''}})
    await provide({note, topic, blocks: [HEADLINE, STANDFIRST, `Topics: ${topic.title}`, ...DAYS]})
    // The note points to the topic once it's sorted, so the two go together.
    await page.close()
    await content.transaction().delete(`drafts.${note.id}`).delete(topic.id).commit()
  },
})

async function openEmpty(page: Page, note: TestPost): Promise<Room> {
  const room = new Room(page)
  await page.goto(note.roomPath)
  await expect(room.body).toBeVisible({timeout: 45_000})
  return room
}

/** Pastes as a word processor would: the same piece as HTML and as plain text. */
async function paste(room: Room, blocks: string[]) {
  await room.body.click()
  await room.body.evaluate((element, pasted) => {
    const clipboard = new DataTransfer()
    clipboard.setData('text/plain', pasted.join('\n\n'))
    clipboard.setData('text/html', pasted.map((text, index) => (index === 0 ? `<h1>${text}</h1>` : `<p>${text}</p>`)).join(''))
    element.dispatchEvent(new ClipboardEvent('paste', {clipboardData: clipboard, bubbles: true, cancelable: true}))
  }, blocks)
  await expect(room.body).toContainText(blocks.at(-1)!)
}

/** Answers for the Sorting route, as the model would for this piece, and keeps what the room sent. */
async function answerFor(page: Page, {topic}: Piece) {
  const sent: Array<{request: SortingRequest; authorization: string | undefined}> = []
  await page.route('**/api/sort', async (route) => {
    const request = route.request().postDataJSON() as SortingRequest
    sent.push({request, authorization: route.request().headers().authorization})
    const block = (text: string) => request.blocks.find((candidate) => candidate.text === text)?.id ?? 'missing'
    const response: SortingResponse = {
      version: 1,
      headline: {block: block(HEADLINE), confidence: 0.97},
      placed: [{field: 'summary', block: block(STANDFIRST), confidence: 0.95}],
      picked: [
        {field: 'mood', options: ['calm'], kind: 'judged', line: null, confidence: 0.95},
        {field: 'topics', options: [topic.id], kind: 'stated', line: block(`Topics: ${topic.title}`), confidence: 0.95},
      ],
      listed: [],
    }
    await route.fulfill({json: response})
  })
  return sent
}

const offer = (page: Page) => page.getByRole('status').filter({hasText: 'Pasted a whole piece'})
const sorted = (page: Page) => page.getByRole('status').filter({hasText: /^Sorted\./})
const bodyText = (draft: Record<string, unknown>) => JSON.stringify(draft.body ?? [])

test('offers to sort a whole piece pasted into an empty body, until the Writer writes on', async ({page, piece}) => {
  const room = await openEmpty(page, piece.note)
  await paste(room, piece.blocks)

  await expect(offer(page)).toBeVisible()
  // A paste reaches the document in several steps; none of them may take the offer away.
  await page.waitForTimeout(3000)
  await expect(offer(page)).toBeVisible()
  await expect(page.getByRole('button', {name: 'Sort', exact: true})).toBeVisible()

  await room.body.click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type(' And one more thought.')
  await expect(offer(page)).toHaveCount(0)
})

test('offers nothing for a passage', async ({page, piece}) => {
  const room = await openEmpty(page, piece.note)
  await paste(room, [HEADLINE, STANDFIRST])

  await page.waitForTimeout(2000)
  await expect(offer(page)).toHaveCount(0)
})

test('offers nothing when the rest of a piece is pasted after a passage', async ({page, piece}) => {
  const room = await openEmpty(page, piece.note)
  await paste(room, [HEADLINE, STANDFIRST])
  // The body has words in it now, so this paste isn't one into an empty document.
  await page.keyboard.press('ControlOrMeta+End')
  await paste(room, DAYS)

  await page.waitForTimeout(2500)
  await expect(offer(page)).toHaveCount(0)
})

test('sorts the piece into the title and Details, and Details draws what was filled', async ({page, piece, content}) => {
  const sent = await answerFor(page, piece)
  const room = await openEmpty(page, piece.note)
  await paste(room, piece.blocks)

  await page.getByRole('button', {name: 'Sort', exact: true}).click()
  await expect(sorted(page)).toBeVisible()

  expect(sent).toHaveLength(1)
  expect(sent[0]!.authorization).toMatch(/^Bearer \S+/)
  expect(sent[0]!.request.fields.map((field) => field.name)).toEqual(expect.arrayContaining(['summary', 'mood', 'topics']))

  await expect(room.title).toHaveValue(HEADLINE)
  await expectDraft(content, piece.note.id, (draft) => {
    expect(draft.title).toBe(HEADLINE)
    expect(draft.summary).toBe(STANDFIRST)
    expect(draft.mood).toBe('calm')
    expect(draft.topics).toMatchObject([{_ref: piece.topic.id}])
    expect(bodyText(draft)).not.toContain(HEADLINE)
    expect(bodyText(draft)).not.toContain(STANDFIRST)
    expect(bodyText(draft)).not.toContain(piece.topic.title)
    expect(bodyText(draft)).toContain('Day 4.')
  })

  await page.getByRole('button', {name: 'See Details'}).click()
  await expect(room.details).toBeVisible()
  await expect(page.getByLabel('Summary')).toHaveValue(STANDFIRST)
  // A list of references is drawn by Sanity's own array input, which draws only what's in view.
  await room.details.getByText('Topics', {exact: true}).scrollIntoViewIfNeeded()
  await expect(room.details.getByText(piece.topic.title)).toBeVisible()
  await expect(page.locator('[data-calm-from-paste]')).toHaveCount(3)
})

test('puts everything back on Undo', async ({page, piece, content}) => {
  await answerFor(page, piece)
  const room = await openEmpty(page, piece.note)
  await paste(room, piece.blocks)
  await page.getByRole('button', {name: 'Sort', exact: true}).click()
  await expect(sorted(page)).toBeVisible()
  await expect(room.title).toHaveValue(HEADLINE)

  await page.getByRole('button', {name: 'Undo'}).click()

  await expect(sorted(page)).toHaveCount(0)
  await expect(room.title).toHaveValue('')
  await expect(room.body).toContainText(STANDFIRST)
  await expectDraft(content, piece.note.id, (draft) => {
    expect(draft.summary).toBeUndefined()
    expect(draft.topics).toBeUndefined()
    expect(bodyText(draft)).toContain(HEADLINE)
  })
})

test('ends Undo at the first edit, even to something Sorting left alone', async ({page, piece}) => {
  // Only a pick: no block leaves the body, so the body is not among what Sorting touched.
  await page.route('**/api/sort', (route) => {
    const response: SortingResponse = {
      version: 1,
      headline: null,
      placed: [],
      picked: [{field: 'mood', options: ['calm'], kind: 'judged', line: null, confidence: 0.95}],
      listed: [],
    }
    return route.fulfill({json: response})
  })
  const room = await openEmpty(page, piece.note)
  await paste(room, piece.blocks)
  await page.getByRole('button', {name: 'Sort', exact: true}).click()
  await expect(sorted(page)).toBeVisible()
  // It stays while nothing is edited.
  await page.waitForTimeout(3000)
  await expect(page.getByRole('button', {name: 'Undo'})).toBeVisible()

  await room.body.click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type(' And one more thought.')

  await expect(sorted(page)).toHaveCount(0)
  await expect(page.getByRole('button', {name: 'Undo'})).toHaveCount(0)
})

test('says so, and keeps every word, when the route fails', async ({page, piece, content}) => {
  await page.route('**/api/sort', (route) => route.fulfill({status: 502, json: {error: 'unavailable'}}))
  const room = await openEmpty(page, piece.note)
  await paste(room, piece.blocks)

  await page.getByRole('button', {name: 'Sort', exact: true}).click()

  await expect(page.getByRole('status').filter({hasText: 'Couldn’t sort this just now'})).toBeVisible()
  await expect(room.body).toContainText(HEADLINE)
  await expectDraft(content, piece.note.id, (draft) => {
    expect(draft.summary).toBeUndefined()
    expect(bodyText(draft)).toContain(STANDFIRST)
  })
})
