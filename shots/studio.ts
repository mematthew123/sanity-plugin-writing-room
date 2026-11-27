import {randomUUID} from 'node:crypto'
import {test as base, type BrowserContext, type Page} from '@playwright/test'
import {contentClient} from '../e2e/content'
import {projectId, studioUrl, token} from '../e2e/env'
import {type TestPost} from '../e2e/fixtures'
import {essay, essayBody, pictureHtml} from './essay'
import {ID_PREFIX, PICTURE_FILENAME} from './global-setup'

/** What `pnpm shots` and `pnpm vrt` share. */

export async function signIn(context: BrowserContext) {
  // Init scripts run on every origin the context opens; the token is only for the Studio.
  await context.addInitScript(
    ([studio, key, value]) => {
      if (window.location.origin === studio) window.localStorage.setItem(key, value)
    },
    [new URL(studioUrl).origin, `__studio_auth_token_${projectId}`, JSON.stringify({token})] as const,
  )
  // The room takes the token's other sessions for company ("… is here too"); hide that note.
  await context.addInitScript(() => {
    const hide = () => {
      for (const note of document.querySelectorAll<HTMLElement>('[role="status"]')) {
        if (!/here too$/.test(note.textContent ?? '')) continue
        note.style.display = 'none'
        // So `pnpm vrt` can tell it from the room's own notes.
        note.hidden = true
      }
    }
    new MutationObserver(hide).observe(document, {subtree: true, childList: true, characterData: true})
  })
}

export const test = base.extend<{post: TestPost}, {picture: string}>({
  // Uploaded once: the same bytes always get the same asset id.
  picture: [
    async ({browser}, provide) => {
      const page = await browser.newPage({viewport: {width: 1600, height: 1000}})
      await page.setContent(pictureHtml)
      const png = await page.screenshot()
      await page.close()
      const content = contentClient()
      const asset = await content.assets.upload('image', png, {filename: PICTURE_FILENAME})
      await provide(asset._id)
      // Still referenced if a capture was interrupted; a later run sweeps both up (see global-setup.ts).
      await content.delete(asset._id).catch(() => undefined)
    },
    {scope: 'worker'},
  ],

  context: async ({context}, provide) => {
    await signIn(context)
    await provide(context)
  },

  post: async ({page, picture}, provide) => {
    const content = contentClient()
    const id = `${ID_PREFIX}${randomUUID()}`
    await content.create({
      _id: `drafts.${id}`,
      _type: 'post',
      title: essay.title,
      body: essayBody(picture),
      slug: {_type: 'slug', current: essay.slug},
      excerpt: essay.excerpt,
      tags: essay.tags,
      coverImage: {_type: 'image', asset: {_type: 'reference', _ref: picture}, alt: essay.coverAlt},
    })
    await provide({id, title: essay.title, type: 'post', roomPath: `/writing-room/${id}`})
    await page.close()
    await content.transaction().delete(`drafts.${id}`).delete(id).commit()
  },

})

/** Fonts in, pictures in, and whatever was moving has stopped. */
export async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all(
      Array.from(document.images, (image) => (image.complete ? null : new Promise((done) => (image.onload = image.onerror = done)))),
    )
  })
  await page.waitForTimeout(700)
}

/** Puts away what belongs to this Studio and this login, not to the room. */
export async function tidy(page: Page) {
  // Sanity's own announcements.
  const announcement = page.getByRole('button', {name: 'Got it'})
  if (await announcement.isVisible()) await announcement.click()
  // Away from anything that answers to a pointer.
  await page.mouse.move(4, 600)
}

/** Where `text` sits in the body: its first line's left and right edges, and its middle. */
export async function find(page: Page, text: string) {
  const box = await page.evaluate((words) => {
    const walker = document.createTreeWalker(document.querySelector('[aria-label="Body"]')!, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const start = node.textContent?.indexOf(words) ?? -1
      if (start === -1) continue
      const range = document.createRange()
      range.setStart(node, start)
      range.setEnd(node, start + words.length)
      const lines = range.getClientRects()
      const first = lines[0]!
      const last = lines[lines.length - 1]!
      return {left: first.left, right: first.right, y: first.top + first.height / 2, end: last.right, endY: last.top + last.height / 2}
    }
    return null
  }, text)
  if (!box) throw new Error(`"${text}" isn't in the body.`)
  return box
}

export async function caretAfter(page: Page, text: string) {
  const box = await find(page, text)
  await page.mouse.click(box.end + 1, box.endY)
}

/** Drags across `words` in the body, as a Writer would select them. */
export async function select(page: Page, words: string) {
  const box = await find(page, words)
  await page.mouse.move(box.left + 1, box.y)
  await page.mouse.down()
  await page.mouse.move(box.end - 1, box.endY, {steps: 12})
  await page.mouse.up()
}
