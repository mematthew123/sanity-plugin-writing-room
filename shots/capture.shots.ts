import {execFileSync} from 'node:child_process'
import {mkdirSync, rmSync} from 'node:fs'
import {join, resolve} from 'node:path'
import {expect} from '@playwright/test'
import {missing} from '../e2e/env'
import {Room} from '../e2e/room'
import {essay} from './essay'
import {caretAfter, select, settle, signIn, test as base, tidy} from './studio'

/**
 * Captures of the room for writingroom.studio. Each one seeds the essay as a draft Post (ids
 * starting `shots-`), photographs the room in one state, and removes the Post again. Nothing is
 * published. The `dark` and `light` projects make one file each: `room-dark.png`, `room-light.png`.
 */

const OUT = resolve(process.env.SHOTS_OUT || 'shots/out')

// Before any fixture: the picture is uploaded ahead of the first capture, and needs the token too.
base.skip(!!missing, missing ?? '')

const test = base.extend<{shot: (name: string) => Promise<void>}>({
  shot: async ({page}, provide, testInfo) => {
    mkdirSync(OUT, {recursive: true})
    await provide(async (name) => {
      await tidy(page)
      await settle(page)
      await page.screenshot({path: join(OUT, `${name}-${testInfo.project.name}.png`)})
    })
  },
})

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
