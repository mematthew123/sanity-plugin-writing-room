import {mkdirSync, writeFileSync} from 'node:fs'
import {join, resolve} from 'node:path'
import {expect, type Page} from '@playwright/test'
import {missing} from '../e2e/env'
import {detailsQuery, Room} from '../e2e/room'
import {essay} from '../shots/essay'
import {caretAfter, find, settle, test as base, tidy} from '../shots/studio'
import {COMPARED_PROPERTIES, PSEUDO_PROPERTIES, snapshotElements, STILL} from './snapshot'

/**
 * `pnpm vrt`: each state of the room leaves a screenshot and a computed-style snapshot under
 * VRT_OUT/<side>/<state>-<window>-<scheme>, for scripts/vrt.mjs to compare. The states are the
 * ones shots/capture.shots.ts photographs.
 */

const OUT = resolve(process.env.VRT_OUT || 'vrt/out/captures')

// Before any fixture: the picture upload needs the token too.
base.skip(!!missing, missing ?? '')

/** Left out of every snapshot: the Studio's or the login's, not the room's. */
const NOT_THE_ROOM = [
  // The Studio's popovers and tooltips.
  'body > :not(#sanity, [data-calm-floating])',
  // The Studio's navbar, which the Lobby keeps.
  '[data-testid="studio-navbar"] *',
  // "… is here too" (see shots/studio.ts).
  '[role="status"][hidden]',
].join(', ')

/** `ignore` selects more to leave out of the snapshot. Hide it first. */
type Snap = (name: string, options?: {ignore?: string}) => Promise<void>

const test = base.extend<{snap: Snap}>({
  snap: async ({page}, provide, testInfo) => {
    const [side, ...variant] = testInfo.project.name.split('-')
    const dir = join(OUT, side!)
    mkdirSync(dir, {recursive: true})
    await provide(async (name, {ignore} = {}) => {
      const file = join(dir, `${name}-${variant.join('-')}`)
      await tidy(page)
      await settle(page)
      const elements = await page.evaluate(snapshotElements, {
        comparedProperties: COMPARED_PROPERTIES,
        pseudoProperties: PSEUDO_PROPERTIES,
        ignore: ignore ? `${NOT_THE_ROOM}, ${ignore}` : NOT_THE_ROOM,
      })
      writeFileSync(`${file}.json`, JSON.stringify(elements))
      await page.screenshot({path: `${file}.png`, animations: 'disabled', caret: 'hide', style: STILL})
    })
  },
})

/** Brings `words` in the body into the window: on a phone they can start below the fold, where a click misses. */
async function scrollToWords(page: Page, words: string) {
  await page.evaluate((text) => {
    const walker = document.createTreeWalker(document.querySelector('[aria-label="Body"]')!, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.textContent?.includes(text)) return node.parentElement?.scrollIntoView({block: 'center', behavior: 'instant'})
    }
    return undefined
  }, words)
}

/** Selects `words` from the keyboard: a drag can end a letter either way, which moves the bubble. */
async function selectByKeys(page: Page, words: string) {
  await scrollToWords(page, words)
  const box = await find(page, words)
  await page.mouse.click(box.left + 1, box.y)
  await page.keyboard.down('Shift')
  for (let letter = 0; letter < words.length; letter++) await page.keyboard.press('ArrowRight')
  await page.keyboard.up('Shift')
}

test('room: the essay, as the Writer finds it', async ({page, post, snap}) => {
  await new Room(page).open(post)
  await snap('room')
})

test('room-end: the essay, read to its last line', async ({page, post, snap}) => {
  const room = new Room(page)
  await room.open(post)
  // The essay's end moves until the picture has its height.
  await settle(page)
  await room.scroller.evaluate((scroller) => scroller.scrollTo(0, scroller.scrollHeight))
  await snap('room-end')
})

test('selection-bubble: formatting above a selection', async ({page, post, snap}) => {
  await new Room(page).open(post)
  // A selection made while the Post is still arriving is dropped, so it is made again.
  await expect(async () => {
    await selectByKeys(page, essay.selected)
    await expect(page.getByRole('toolbar', {name: 'Formatting'})).toBeVisible({timeout: 3_000})
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(essay.selected)
  }).toPass({timeout: 30_000})
  await snap('selection-bubble')
})

test('insert-menu: a slash on an empty line', async ({page, post, snap}) => {
  await new Room(page).open(post)
  await scrollToWords(page, 'one at a time.')
  await caretAfter(page, 'one at a time.')
  await page.keyboard.press('Enter')
  await page.keyboard.type('/')
  await expect(page.getByRole('listbox', {name: 'Insert'})).toBeVisible()
  await snap('insert-menu')
})

test('details: everything that isn’t the title or the body', async ({page, post, snap}) => {
  const room = new Room(page)
  // By its address: a phone has no Details button in the room itself.
  await room.open(post, detailsQuery())
  await expect(room.details).toBeVisible()
  await snap('details')
})

test('publish: the room asks once', async ({page, post, snap}) => {
  await new Room(page).open(post)
  await page.getByRole('button', {name: 'Publish', exact: true}).click()
  await expect(page.getByRole('button', {name: /^Publish/}).nth(1)).toBeVisible({timeout: 30_000})
  await snap('publish')
  await page.keyboard.press('Escape')
})

test('settings: the Aa menu', async ({page, post, snap}) => {
  await new Room(page).open(post)
  await page.getByRole('button', {name: 'Room settings'}).click()
  await expect(page.getByText('Typewriter scrolling')).toBeVisible()
  await snap('settings')
})

test('lobby: the doorway', async ({page, post, snap}) => {
  // Opened once, so the Lobby offers it under "Continue writing".
  await new Room(page).open(post)
  await page.getByRole('button', {name: 'Back to the Lobby'}).click()
  await expect(page.getByText(essay.title).first()).toBeVisible()
  // The other captures' and tests' Posts come and go in the Lobby's list, so it is compared with
  // one row under "Recent": the newest that isn't theirs. Rows load as they come into view.
  const passing = 'li:has(a:is([href*="/shots-"], [href*="/e2e-"]))'
  const others = `${passing}, li:not(${passing}) ~ li`
  await page.addStyleTag({content: `${others} { display: none !important; }`})
  await expect(async () => {
    const settled = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('section[aria-labelledby="calm-recent"] li'))
      const shown = rows.filter((row) => row.getClientRects().length > 0)
      return shown.length === 0 || (shown.length === 1 && !!shown[0]!.querySelector('a'))
    })
    expect(settled, 'one row under Recent, and it has loaded').toBe(true)
  }).toPass({timeout: 30_000})
  await snap('lobby', {ignore: others})
})
