import {expect, expectDraft, test} from './fixtures'
import {Room} from './room'

/** One pixel. The same bytes every run, so the dataset only ever holds one of it. */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

type Block = {_type: string; asset?: {_ref?: string}}
const images = (draft: Record<string, unknown>) =>
  (draft.body as Block[]).filter((block) => block._type === 'image')

async function onANewLine(room: Room) {
  await room.body.click()
  await room.page.keyboard.press('ControlOrMeta+End')
  await room.page.keyboard.press('Enter')
}

test('chooses an image that already exists, from the Studio’s own image source', async ({page, post, content}) => {
  const existing = await content.assets.upload('image', PIXEL, {filename: 'e2e-pixel.png'})
  const room = new Room(page)
  await room.open(post)
  await onANewLine(room)

  await page.keyboard.type('/image')
  const menu = page.getByRole('listbox', {name: 'Insert'})
  await expect(menu.getByRole('option')).toHaveText(['Upload an image', 'Choose an image'])
  await menu.getByRole('option', {name: 'Choose an image'}).click()

  await page.getByRole('listbox', {name: 'Choose an image from'}).getByRole('option').first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.locator(`[data-id="${existing._id}"]`).first().click()

  await expect(dialog).toHaveCount(0)
  await expectDraft(content, post.id, (draft) => {
    expect(images(draft).map((image) => image.asset?._ref)).toEqual([existing._id])
  })
  // The Writer is back where they were, with the description waiting.
  await expect(page.getByRole('textbox', {name: 'Image description'})).toBeVisible()
})

test('backs out of choosing with nothing changed', async ({page, post, content}) => {
  const room = new Room(page)
  await room.open(post)
  await onANewLine(room)

  await page.getByRole('button', {name: 'Insert'}).click()
  await page.getByRole('option', {name: 'Choose an image'}).click()
  const sources = page.getByRole('listbox', {name: 'Choose an image from'})
  await expect(sources).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(sources).toHaveCount(0)

  await page.keyboard.type('Still writing.')
  await expectDraft(content, post.id, (draft) => {
    expect(images(draft)).toEqual([])
    expect(JSON.stringify(draft.body)).toContain('Still writing.')
  })
})

test('uploads what an image source hands back as a file', async ({page, post, content}) => {
  const room = new Room(page)
  await room.open(post)
  await onANewLine(room)

  await page.keyboard.type('/choose')
  await page.keyboard.press('Enter')
  await page.getByRole('option', {name: 'Test pictures'}).click()
  await page.getByRole('button', {name: 'Hand back a file'}).click()

  await expectDraft(content, post.id, (draft) => {
    expect(images(draft)).toHaveLength(1)
    expect(images(draft)[0]!.asset?._ref).toMatch(/^image-/)
  })
})
