import {expect, expectDraft, test} from './fixtures'
import {Room} from './room'

test.beforeEach(async ({page, makePost}, testInfo) => {
  const note = await makePost({type: 'fieldNote', fields: {summary: 'A summary.'}})
  testInfo.annotations.push({type: 'note', description: note.id})
  const room = new Room(page)
  await room.open(note)
  await room.openDetails()
})

const noteId = (testInfo: {annotations: {type: string; description?: string}[]}) =>
  testInfo.annotations.find((annotation) => annotation.type === 'note')!.description!

test('saves a number, and unsets it when the field is emptied', async ({page, content}, testInfo) => {
  const rating = page.getByLabel('Rating')

  await rating.fill('4.5')
  await expectDraft(content, noteId(testInfo), (draft) => expect(draft.rating).toBe(4.5))

  await rating.fill('')
  await expectDraft(content, noteId(testInfo), (draft) => expect(draft.rating).toBeUndefined())
})

test('keeps what is typed while it isn’t a number yet', async ({page, content}, testInfo) => {
  const rating = page.getByLabel('Rating')

  await rating.pressSequentially('-2.')
  await expect(rating).toHaveValue('-2.')
  await expectDraft(content, noteId(testInfo), (draft) => expect(draft.rating).toBe(-2))
})

test('turns a switch on and off, with its label shown once', async ({page, content}, testInfo) => {
  const room = new Room(page)
  const featured = page.getByRole('switch', {name: 'Featured'})
  await expect(room.field('featured').getByText('Featured', {exact: true})).toHaveCount(1)

  await featured.click()
  await expectDraft(content, noteId(testInfo), (draft) => expect(draft.featured).toBe(true))

  await featured.click()
  await expectDraft(content, noteId(testInfo), (draft) => expect(draft.featured).toBe(false))
})

test('saves a date', async ({page, content}, testInfo) => {
  await page.getByLabel('Day').fill('2026-11-12')

  await expectDraft(content, noteId(testInfo), (draft) => expect(draft.day).toBe('2026-11-12'))
})

test('grows longer text with what is written', async ({page}) => {
  const summary = page.getByLabel('Summary')
  const before = (await summary.boundingBox())!.height

  await summary.fill(Array.from({length: 12}, (_, index) => `Line ${index + 1} of a long summary.`).join(' '))

  expect((await summary.boundingBox())!.height).toBeGreaterThan(before)
})

test('leaves a list of choices to Sanity, under the room’s own label', async ({page, content}, testInfo) => {
  const room = new Room(page)
  const mood = room.field('mood')
  await expect(mood.getByText('Mood', {exact: true})).toBeVisible()

  await mood.getByRole('combobox').selectOption({label: 'Restless'})

  await expectDraft(content, noteId(testInfo), (draft) => expect(draft.mood).toBe('restless'))
})
