import {expect, expectDraft, test} from './fixtures'
import {Room} from './room'

/**
 * The Studio's own locks and actions, on the dev Studio's lock notes: see e2e/lock-notes.ts and
 * e2e/lock-note-actions.tsx. A lock that comes from the Writer's role needs a second login with
 * a lesser role, and isn't tested here.
 */

const PUBLISH = {name: 'Publish', exact: true} as const
const NOT_OPEN = 'isn’t open for changes right now.'

test('locks the title alone where the schema locks the title', async ({page, makePost, content}) => {
  const note = await makePost({type: 'lockedNote', fields: {lock: 'title'}})
  const room = new Room(page)
  await room.open(note)

  await expect(room.title).not.toBeEditable()
  await room.title.click()
  await page.keyboard.type('q')
  await expect(page.getByText(`title ${NOT_OPEN}`)).toBeVisible()

  await room.body.click()
  await page.keyboard.type('Still mine to write. ')
  await expectDraft(content, note.id, (draft) => {
    expect(draft.title).toBe(note.title)
    expect(JSON.stringify(draft.body)).toContain('Still mine to write.')
  })
  await expect(page.getByText('read only')).toHaveCount(0)
})

test('locks the body alone where the schema locks the body', async ({page, makePost, content}) => {
  const note = await makePost({type: 'lockedNote', fields: {lock: 'body'}})
  const room = new Room(page)
  await room.open(note)

  // Locked, the body is there to read: no longer a textbox.
  const lockedBody = page.getByLabel('Body')
  await expect(lockedBody).toContainText('Paragraph 1.')
  await lockedBody.click()
  await page.keyboard.type('qqq')
  await expect(page.getByText(`body ${NOT_OPEN}`)).toBeVisible()
  await expect(lockedBody).not.toContainText('qqq')

  await room.title.fill('A title that can still change')
  await expectDraft(content, note.id, (draft) => expect(draft.title).toBe('A title that can still change'))
})

test('locks the whole room where the schema locks the type, with nothing to unlock', async ({page, makePost}) => {
  const note = await makePost({type: 'lockedNote', fields: {lock: 'everything'}})
  const room = new Room(page)
  await room.open(note)

  await expect(page.getByText('Draft · read only')).toBeVisible()
  await expect(page.getByRole('button', {name: 'Unlock'})).toHaveCount(0)
  await expect(room.title).not.toBeEditable()

  const lockedBody = page.getByLabel('Body')
  await expect(lockedBody).toContainText('Paragraph 1.')
  await lockedBody.click()
  await page.keyboard.type('qqq')
  await expect(page.getByText(`This Locked Note ${NOT_OPEN}`)).toBeVisible()
  await expect(lockedBody).not.toContainText('qqq')
})

for (const lock of ['details', 'everything']) {
  test(`publishes without writing a slug or a date the schema locks (${lock})`, async ({page, makePost, content}) => {
    const note = await makePost({type: 'lockedNote', fields: {lock}})
    const room = new Room(page)
    await room.open(note)

    await page.getByRole('button', PUBLISH).click()
    await page.getByRole('button', {name: 'Publish now'}).click()

    await expect(async () => {
      const published = await content.getDocument<{slug?: unknown; publishedAt?: string}>(note.id)
      expect(published, 'the note is published').toBeTruthy()
      expect(published?.slug).toBeUndefined()
      expect(published?.publishedAt).toBeUndefined()
    }).toPass({timeout: 15_000})
  })
}

test('offers a Studio’s own actions in Publish’s place, and locks once one of them says so', async ({
  page,
  makePost,
  content,
}) => {
  const note = await makePost({type: 'reviewNote', fields: {ask: 'confirm'}})
  const room = new Room(page)
  await room.open(note)

  const requestReview = page.getByRole('button', {name: 'Request review'})
  await expect(requestReview).toBeVisible()
  await expect(page.getByRole('button', PUBLISH)).toHaveCount(0)

  // The Studio's question, in the room's panel, with the room's way out.
  await requestReview.click()
  const panel = page.getByRole('dialog')
  await expect(panel).toContainText('Send this note to an editor?')
  await panel.getByRole('button', {name: 'Not yet'}).click()
  await expect(panel).toHaveCount(0)
  await expectDraft(content, note.id, (draft) => expect(draft.status).toBeUndefined())

  await requestReview.click()
  await panel.getByRole('button', {name: 'Request review'}).click()
  await expectDraft(content, note.id, (draft) => expect(draft.status).toBe('inReview'))

  // The next action takes the button, with its own words for both answers.
  await page.getByRole('button', {name: 'Approve'}).click()
  await expect(panel.getByRole('button', {name: 'Not now'})).toBeVisible()
  await panel.getByRole('button', {name: 'Approve'}).click()
  await expectDraft(content, note.id, (draft) => expect(draft.status).toBe('approved'))

  // Approved, the type is read-only, and with no action of the Studio's left, Publish is back.
  await expect(page.getByText('Draft · read only')).toBeVisible()
  await expect(room.title).not.toBeEditable()
  await page.getByRole('button', PUBLISH).click()
  await page.getByRole('button', {name: 'Publish now'}).click()

  // Published as approved, the Studio's next step is to open it again, and the room unlocks.
  await page.getByRole('button', {name: 'Reopen'}).click()
  await expectDraft(content, note.id, (draft) => expect(draft.status).toBeUndefined())
  await expect(room.title).toBeEditable()
  await expect(requestReview).toBeVisible()
  await expect(page.getByText('read only')).toHaveCount(0)
})

for (const ask of ['popover', 'dialog', 'custom']) {
  test(`runs a Studio’s action that asks in a ${ask}`, async ({page, makePost, content}) => {
    const note = await makePost({type: 'reviewNote', fields: {ask}})
    const room = new Room(page)
    await room.open(note)

    await page.getByRole('button', {name: 'Request review'}).click()
    await expect(page.getByText('Send this note to an editor?')).toBeVisible()
    await page.getByRole('button', {name: 'Send for review'}).click()

    await expectDraft(content, note.id, (draft) => expect(draft.status).toBe('inReview'))
    await expect(page.getByRole('button', {name: 'Approve'})).toBeVisible()
  })
}

test('runs a Studio’s action that doesn’t ask, with the words typed a moment before', async ({
  page,
  makePost,
  content,
}) => {
  const note = await makePost({type: 'reviewNote'})
  const room = new Room(page)
  await room.open(note)

  await room.body.click()
  await page.keyboard.type('Written just before asking. ')
  await page.getByRole('button', {name: 'Request review'}).click()

  await expectDraft(content, note.id, (draft) => {
    expect(draft.status).toBe('inReview')
    expect(JSON.stringify(draft.body)).toContain('Written just before asking.')
  })
})

test('disables a Studio’s action as the Studio does, with its reason', async ({page, makePost}) => {
  const note = await makePost({type: 'reviewNote', fields: {title: ''}})
  const room = new Room(page)
  await page.goto(note.roomPath)

  const requestReview = page.getByRole('button', {name: 'Request review'})
  await expect(requestReview).toBeDisabled({timeout: 45_000})
  await expect(requestReview).toHaveAttribute('title', 'Give the note a title first.')

  await room.title.fill('Now it has one')
  await expect(requestReview).toBeEnabled()
})

test('has no button where a Studio removed Publish', async ({page, makePost}) => {
  const note = await makePost({type: 'noPublishNote'})
  const room = new Room(page)
  await room.open(note)

  await expect(room.body).toBeVisible()
  await expect(page.getByRole('button', PUBLISH)).toHaveCount(0)
  await expect(page.getByRole('button', {name: 'Open in Structure'})).toHaveCount(0)
})

test('offers Open in Structure where a Studio’s action only runs in the form', async ({page, makePost}) => {
  const note = await makePost({type: 'formOnlyNote'})
  const room = new Room(page)
  await room.open(note)

  await expect(page.getByRole('button', {name: 'Open in Structure'})).toBeVisible()
  await expect(page.getByRole('button', PUBLISH)).toHaveCount(0)
})
