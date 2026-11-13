import {expect, expectDraft, test} from './fixtures'
import {detailsQuery, inDetails, Room} from './room'

test('swaps the body for Details and back, keeping the title in place', async ({page, post}) => {
  const room = new Room(page)
  await room.open(post)

  await room.openDetails()
  await expect(page).toHaveURL(inDetails())
  await expect(room.title).toHaveValue(post.title)
  await expect(room.body).toBeHidden()
  await expect(room.detailsButton).toHaveAttribute('aria-pressed', 'true')

  await room.detailsButton.click()
  await expect(room.body).toBeVisible()
  await expect(room.details).toHaveCount(0)
  await expect(page).not.toHaveURL(inDetails())
})

test('shows every field but the title and the body, with no group tabs', async ({page, post}) => {
  const room = new Room(page)
  await room.open(post)
  await room.openDetails()

  for (const name of ['slug', 'excerpt', 'publishedAt', 'tags']) {
    await expect(room.field(name), name).toBeVisible()
  }
  await expect(room.details.getByTestId('image-input')).toBeVisible()
  await expect(room.field('title')).toHaveCount(0)
  await expect(room.details.getByTestId('field-body')).toHaveCount(0)
  await expect(room.details.getByRole('tab')).toHaveCount(0)
})

test('goes one step out: the arrow and Escape return to the Prose, not the Lobby', async ({page, post}) => {
  const room = new Room(page)
  await room.open(post)

  await room.openDetails()
  await room.back.click()
  await expect(room.body).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`${post.id}$`))

  await room.openDetails()
  await page.keyboard.press('Escape')
  await expect(room.body).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`${post.id}$`))
})

test('is a place of its own: a reload stays in Details, and Back leaves it', async ({page, post}) => {
  const room = new Room(page)
  await room.open(post)
  await room.openDetails()

  await page.reload()
  await expect(room.details).toBeVisible({timeout: 45_000})
  await expect(room.title).toHaveValue(post.title)

  await page.goBack()
  await expect(room.body).toBeVisible()
  await expect(room.details).toHaveCount(0)
})

test('opens at one field when the address asks for it', async ({page, post}) => {
  const room = new Room(page)
  await room.open(post, detailsQuery('excerpt'))

  await expect(room.details).toBeVisible()
  await expect(room.field('excerpt').getByRole('textbox')).toBeFocused()
})

test('saves text typed into one of the room’s own inputs', async ({page, post, content}) => {
  const room = new Room(page)
  await room.open(post)
  await room.openDetails()

  await page.getByLabel('Excerpt').fill('An excerpt from the browser test.')

  await expectDraft(content, post.id, (draft) => {
    expect(draft.excerpt).toBe('An excerpt from the browser test.')
  })
})

test('adds tags with Enter and a comma, and takes one away', async ({page, post, content}) => {
  const room = new Room(page)
  await room.open(post)
  await room.openDetails()

  const tags = page.getByLabel('Tags')
  await tags.fill('essay')
  await tags.press('Enter')
  await tags.fill('travel, notes')
  await tags.press('Enter')
  await expectDraft(content, post.id, (draft) => {
    expect(draft.tags).toEqual(['essay', 'travel', 'notes'])
  })

  await page.getByRole('button', {name: 'Remove travel'}).click()
  await expectDraft(content, post.id, (draft) => {
    expect(draft.tags).toEqual(['essay', 'notes'])
  })
})

test('saves a slug typed by hand', async ({page, post, content}) => {
  const room = new Room(page)
  await room.open(post)
  await room.openDetails()

  await page.getByLabel('Slug').fill('a-slug-of-my-own')

  await expectDraft(content, post.id, (draft) => {
    expect(draft.slug).toMatchObject({current: 'a-slug-of-my-own'})
  })
})

test('comes back to the Prose where the Writer left it', async ({page, makePost}) => {
  const post = await makePost({paragraphs: 80})
  const room = new Room(page)
  await room.open(post)

  await room.scroller.evaluate((element) => element.scrollTo(0, 900))
  const before = await room.scrollTop()
  expect(before).toBeGreaterThan(500)

  await room.openDetails()
  expect(await room.scrollTop()).toBe(0)

  await room.back.click()
  await expect(room.body).toBeVisible()
  await expect.poll(() => room.scrollTop()).toBe(before)
})

test('keeps the column still between a long Prose and a short Details', async ({page, makePost}) => {
  const post = await makePost({paragraphs: 80})
  const room = new Room(page)
  await room.open(post)
  const inProse = await room.title.boundingBox()

  await room.openDetails()
  const inDetails = await room.title.boundingBox()

  expect(inDetails?.x).toBe(inProse?.x)
  expect(inDetails?.width).toBe(inProse?.width)
})

test('leaves the Structure form as Sanity draws it', async ({page, post}) => {
  await page.goto(`/intent/edit/id=${post.id};type=${post.type}`)

  await expect(page.getByTestId('field-title').getByTestId('string-input')).toHaveValue(post.title, {
    timeout: 45_000,
  })
  await expect(page.locator('[data-calm-details-field]')).toHaveCount(0)
})
