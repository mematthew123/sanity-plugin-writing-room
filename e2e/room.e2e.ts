import {expect, expectDraft, test} from './fixtures'
import {Room} from './room'

test('opens a Post with its title and body, and nothing of the Studio around it', async ({page, post}) => {
  const room = new Room(page)
  await room.open(post)

  await expect(room.body).toContainText('Paragraph 1.')
  await expect(page.getByRole('button', {name: 'Back to the Lobby'})).toBeVisible()
  await expect(room.details).toHaveCount(0)
})

test('saves what the Writer types in the body', async ({page, post, content}) => {
  const room = new Room(page)
  await room.open(post)

  await room.body.click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type(' A sentence from the browser test.')

  await expectDraft(content, post.id, (draft) => {
    expect(JSON.stringify(draft.body)).toContain('A sentence from the browser test.')
  })
})

test('saves a change to the title', async ({page, post, content}) => {
  const room = new Room(page)
  await room.open(post)

  await room.title.fill('A new title from the browser test')

  await expectDraft(content, post.id, (draft) => {
    expect(draft.title).toBe('A new title from the browser test')
  })
})
