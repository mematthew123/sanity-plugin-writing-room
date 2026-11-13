import {expect, expectDraft, test} from './fixtures'
import {Room} from './room'

test('publishes after asking once, with a slug made from the title', async ({page, makePost, content}) => {
  const post = await makePost()
  const room = new Room(page)
  await room.open(post)

  await page.getByRole('button', {name: 'Publish', exact: true}).click()
  await page.getByRole('button', {name: 'Publish now'}).click()
  await expect(page.getByText('Published', {exact: true}).first()).toBeVisible()

  await expect(async () => {
    const published = await content.getDocument<{slug?: {current?: string}; publishedAt?: string}>(post.id)
    expect(published?.slug?.current).toMatch(/^e2e-/)
    expect(published?.publishedAt).toBeTruthy()
  }).toPass({timeout: 15_000})
})

test('publishes the slug the Writer typed in Details a moment before', async ({page, makePost, content}) => {
  const post = await makePost()
  const slug = `typed-by-hand-${post.id.slice(-8)}`
  const room = new Room(page)
  await room.open(post)
  await room.openDetails()

  await page.getByLabel('Slug').fill(slug)
  await page.getByRole('button', {name: 'Publish', exact: true}).click()
  await page.getByRole('button', {name: 'Publish now'}).click()

  await expect(async () => {
    const published = await content.getDocument<{slug?: {current?: string}}>(post.id)
    expect(published?.slug?.current).toBe(slug)
  }).toPass({timeout: 15_000})
})

test('says "Not yet" and nothing is published', async ({page, post, content}) => {
  const room = new Room(page)
  await room.open(post)

  await page.getByRole('button', {name: 'Publish', exact: true}).click()
  await page.getByRole('button', {name: 'Not yet'}).click()

  await expect(page.getByRole('button', {name: 'Publish now'})).toHaveCount(0)
  await expectDraft(content, post.id, () => undefined)
  expect(await content.getDocument(post.id)).toBeFalsy()
})
