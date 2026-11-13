import {expect, test} from './fixtures'
import {detailsQuery, Room} from './room'

test('reaches Details through Room Settings on a phone, and the arrow comes back', async ({page, post}) => {
  const room = new Room(page)
  await room.open(post)

  await page.getByRole('button', {name: 'Room settings'}).click()
  await page.getByRole('dialog', {name: 'Room settings'}).getByRole('button', {name: 'Details'}).click()
  await expect(room.details).toBeVisible()

  await room.back.click()
  await expect(room.body).toBeVisible()
})

test('never scrolls sideways in Details', async ({page, post}) => {
  const room = new Room(page)
  await room.open(post, detailsQuery())
  await expect(room.details).toBeVisible()

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})
