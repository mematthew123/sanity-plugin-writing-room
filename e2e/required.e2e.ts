import {expect, test} from './fixtures'
import {inDetails, Room} from './room'

test('takes the Writer to the Details field that blocks a publish, then publishes once it’s filled', async ({
  page,
  makePost,
  content,
}) => {
  const note = await makePost({type: 'fieldNote'})
  const room = new Room(page)
  await room.open(note)

  await page.getByRole('button', {name: 'Publish', exact: true}).click()

  await expect(room.details).toBeVisible()
  await expect(page).toHaveURL(inDetails('summary'))
  await expect(page.getByRole('alert')).toContainText('Every Field Note needs a summary.')
  const summary = page.getByLabel('Summary')
  await expect(summary).toBeFocused()
  expect(await content.getDocument(note.id)).toBeFalsy()

  await summary.fill('Now it has one.')
  await page.getByRole('button', {name: 'Publish', exact: true}).click()
  await page.getByRole('button', {name: 'Publish now'}).click()

  await expect(async () => {
    const published = await content.getDocument<{summary?: string}>(note.id)
    expect(published?.summary).toBe('Now it has one.')
  }).toPass({timeout: 15_000})
})

test('opens a Field Note at its own address, with the type in the path', async ({page, makePost}) => {
  const note = await makePost({type: 'fieldNote', fields: {summary: 'A summary.'}})
  const room = new Room(page)
  await room.open(note)

  await expect(page).toHaveURL(new RegExp(`/writing-room/fieldNote/${note.id}$`))
  await room.openDetails()
  await expect(page).toHaveURL(new RegExp(`/writing-room/fieldNote/${note.id}\\?`))
  await expect(page).toHaveURL(inDetails())
})
