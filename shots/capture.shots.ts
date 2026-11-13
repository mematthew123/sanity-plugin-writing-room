import {execFileSync} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {mkdirSync, rmSync} from 'node:fs'
import {join, resolve} from 'node:path'
import {expect, test as base, type BrowserContext, type Page} from '@playwright/test'
import {contentClient} from '../e2e/content'
import {missing, projectId, studioUrl, token} from '../e2e/env'
import {type TestPost} from '../e2e/fixtures'
import {Room} from '../e2e/room'
import {essay, essayBody, pictureHtml} from './essay'

/**
 * Captures of the room for writingroom.studio. Each one seeds the essay as a draft Post (ids
 * starting `shots-`), photographs the room in one state, and removes the Post again. Nothing is
 * published. The `dark` and `light` projects make one file each: `room-dark.png`, `room-light.png`.
 */

const OUT = resolve(process.env.SHOTS_OUT || 'shots/out')
const ID_PREFIX = 'shots-'

async function signIn(context: BrowserContext) {
  // Init scripts run on every page and every frame the context opens, and one capture leaves the
  // Studio for the reading site. The token is for the Studio, so it is written there and nowhere else.
  await context.addInitScript(
    ([studio, key, value]) => {
      if (window.location.origin === studio) window.localStorage.setItem(key, value)
    },
    [new URL(studioUrl).origin, `__studio_auth_token_${projectId}`, JSON.stringify({token})] as const,
  )
  // The captures sign in with a token, and the room takes the token's other sessions for company
  // ("… is here too"). Nobody else is here, so the note is put away whenever it turns up.
  await context.addInitScript(() => {
    const hide = () => {
      for (const note of document.querySelectorAll<HTMLElement>('[role="status"]')) {
        if (/here too$/.test(note.textContent ?? '')) note.style.display = 'none'
      }
    }
    new MutationObserver(hide).observe(document, {subtree: true, childList: true, characterData: true})
  })
}

const test = base.extend<{post: TestPost; shot: (name: string) => Promise<void>}, {picture: string}>({
  // The essay's one picture, uploaded once. The same bytes always get the same asset id.
  picture: [
    async ({browser}, provide) => {
      const page = await browser.newPage({viewport: {width: 1600, height: 1000}})
      await page.setContent(pictureHtml)
      const png = await page.screenshot()
      await page.close()
      const content = contentClient()
      const asset = await content.assets.upload('image', png, {filename: 'shots-desk.png'})
      await provide(asset._id)
      // Still referenced if a capture was interrupted; the next run removes it.
      await content.delete(asset._id).catch(() => undefined)
    },
    {scope: 'worker'},
  ],

  context: async ({context}, provide) => {
    await signIn(context)
    await provide(context)
  },

  post: async ({page, picture}, provide, testInfo) => {
    testInfo.skip(!!missing, missing ?? '')
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

  shot: async ({page}, provide, testInfo) => {
    mkdirSync(OUT, {recursive: true})
    await provide(async (name) => {
      await tidy(page)
      await settle(page)
      await page.screenshot({path: join(OUT, `${name}-${testInfo.project.name}.png`)})
    })
  },
})

/** Fonts in, pictures in, and whatever was moving has stopped. */
async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all(
      Array.from(document.images, (image) => (image.complete ? null : new Promise((done) => (image.onload = image.onerror = done)))),
    )
  })
  await page.waitForTimeout(700)
}

/** Puts away what belongs to this Studio and this login, not to the room. */
async function tidy(page: Page) {
  // Sanity's own announcements, which open over the Studio when they like.
  const announcement = page.getByRole('button', {name: 'Got it'})
  if (await announcement.isVisible()) await announcement.click()
  // Away from anything that answers to a pointer.
  await page.mouse.move(4, 600)
}

/** Where `text` sits in the body: its first line's left and right edges, and its middle. */
async function find(page: Page, text: string) {
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

/** Puts the caret straight after `text`, with a click. */
async function caretAfter(page: Page, text: string) {
  const box = await find(page, text)
  await page.mouse.click(box.end + 1, box.endY)
}

/** Drags across `words` in the body, as a Writer would select them. */
async function select(page: Page, words: string) {
  const box = await find(page, words)
  await page.mouse.move(box.left + 1, box.y)
  await page.mouse.down()
  await page.mouse.move(box.right - 1, box.y, {steps: 12})
  await page.mouse.up()
}

test('room: the essay, as the Writer finds it', async ({page, post, shot}) => {
  await new Room(page).open(post)
  await shot('room')
})

test('selection-bubble: formatting above a selection', async ({page, post, shot}) => {
  await new Room(page).open(post)
  await select(page, essay.selected)
  await expect(page.getByRole('toolbar', {name: 'Formatting'})).toBeVisible()
  await shot('selection-bubble')
})

test('insert-menu: a slash on an empty line', async ({page, post, shot}) => {
  await new Room(page).open(post)
  await caretAfter(page, 'one at a time.')
  await page.keyboard.press('Enter')
  await page.keyboard.type('/')
  await expect(page.getByRole('listbox', {name: 'Insert'})).toBeVisible()
  await shot('insert-menu')
})

test('details: everything that isn’t the title or the body', async ({page, post, shot}) => {
  const room = new Room(page)
  await room.open(post)
  await room.openDetails()
  await shot('details')
})

test('publish: the room asks once', async ({page, post, shot}) => {
  await new Room(page).open(post)
  await page.getByRole('button', {name: 'Publish', exact: true}).click()
  await expect(page.getByRole('button', {name: /^Publish/}).nth(1)).toBeVisible({timeout: 30_000})
  await shot('publish')
  await page.keyboard.press('Escape')
})

test('settings: the Aa menu', async ({page, post, shot}) => {
  await new Room(page).open(post)
  await page.getByRole('button', {name: 'Room settings'}).click()
  await expect(page.getByText('Typewriter scrolling')).toBeVisible()
  await shot('settings')
})

test('form: the same Post in the Studio’s form', async ({page, post, shot}) => {
  await page.goto(`/structure/post;${post.id}`)
  await expect(page.getByTestId('field-title').getByRole('textbox')).toHaveValue(post.title, {timeout: 45_000})
  await shot('form')
})

test('lobby: the doorway', async ({page, post, shot}) => {
  // Opened once, so the Lobby offers it under "Continue writing".
  await new Room(page).open(post)
  await page.getByRole('button', {name: 'Back to the Lobby'}).click()
  await expect(page.getByText(essay.title).first()).toBeVisible()
  await shot('lobby')
})

test('controls-recede: a loop of the controls fading while typing', async ({browser, post}, testInfo) => {
  const size = {width: 1280, height: 800}
  const dir = testInfo.outputPath('video')
  const context = await browser.newContext({
    viewport: size,
    colorScheme: testInfo.project.use.colorScheme,
    recordVideo: {dir, size},
  })
  await signIn(context)
  const started = Date.now()
  const page = await context.newPage()
  await new Room(page).open(post)
  await settle(page)
  await caretAfter(page, 'one at a time.')
  await page.waitForTimeout(1200)

  const from = (Date.now() - started) / 1000 - 0.8
  await page.keyboard.type(' The page waits, and the room goes quiet around it.', {delay: 75})
  await page.waitForTimeout(3200)
  const length = (Date.now() - started) / 1000 - from

  const video = page.video()
  await context.close()
  mkdirSync(OUT, {recursive: true})
  // Cut to the typing, without sound, small enough to play before anyone waits for it.
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-ss', from.toFixed(2), '-t', length.toFixed(2),
    '-i', await video!.path(),
    '-an', '-c:v', 'libx264', '-crf', '24', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    join(OUT, `controls-recede-${testInfo.project.name}.mp4`),
  ])
  rmSync(dir, {recursive: true, force: true})
})

// Not the room: what a reader sees once a Post is published, on the Calm Editor demo.
// TODO: point this at the essay, once it is published there.
const READING_SITE = process.env.SHOTS_READING_SITE || 'https://calm-editor.vercel.app/posts/bernice-the-best-dog-ever'

test('reading-site: a published Post, as readers see it', async ({page, shot}) => {
  await page.goto(READING_SITE, {waitUntil: 'networkidle'})
  await shot('reading-site')
})
