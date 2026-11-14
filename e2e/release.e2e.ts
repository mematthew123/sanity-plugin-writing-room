import {type SanityClient} from '@sanity/client'
import {expect, expectDraft, test, type TestPost} from './fixtures'
import {Room} from './room'

const TITLE = 'E2E summer drop'

function isPlanRefusal(error: unknown): boolean {
  const {statusCode, message} = error as {statusCode?: number; message?: string}
  return statusCode === 402 || (statusCode === 403 && /plan|feature|not (available|enabled)|upgrade|quota|limit/i.test(message ?? ''))
}

/** Null only where the plan has no Releases; any other failure is a failure, not a reason to skip. */
async function releaseWith(content: SanityClient, post: TestPost): Promise<string | null> {
  const releaseId = `rE2E${post.id.slice(-8).replace(/[^a-zA-Z0-9]/g, 'x')}`
  try {
    await content.releases.create({releaseId, metadata: {title: TITLE, releaseType: 'undecided'}})
  } catch (error) {
    if (isPlanRefusal(error)) return null
    throw error
  }
  await content.createVersion({baseId: `drafts.${post.id}`, publishedId: post.id, releaseId})
  return releaseId
}

const inRelease = (releaseId: string) => `?writing-room[release]=${releaseId}`

test('opens a Post’s copy in a Release, by the Release’s own title, with nothing to publish', async ({
  page,
  post,
  content,
}) => {
  const releaseId = await releaseWith(content, post)
  test.skip(!releaseId, 'This project doesn’t have Content Releases.')
  const room = new Room(page)
  await room.open(post, inRelease(releaseId!))

  await expect(page.getByText(`In ${TITLE}`, {exact: true})).toBeVisible()
  await expect(page.getByRole('button', {name: /^Publish/})).toHaveCount(0)

  await room.title.fill(`${post.title}, for summer`)

  // The Writer's own draft is as it was.
  await expect(async () => {
    const copy = await content.getDocument<{title?: string}>(`versions.${releaseId}.${post.id}`)
    expect(copy?.title).toBe(`${post.title}, for summer`)
  }).toPass({timeout: 20_000})
  await expectDraft(content, post.id, (draft) => expect(draft.title).toBe(post.title))
})

test('stays in the Release when Details opens', async ({page, makePost, content}) => {
  const note = await makePost({type: 'fieldNote', fields: {summary: 'A summary.'}})
  const releaseId = await releaseWith(content, note)
  test.skip(!releaseId, 'This project doesn’t have Content Releases.')
  const room = new Room(page)
  await room.open(note, inRelease(releaseId!))
  await room.openDetails()

  await expect(page).toHaveURL(new RegExp(`release(\\]|%5D)=${releaseId}`))
  await expect(page.getByText(`In ${TITLE}`, {exact: true})).toBeVisible()
  await page.getByLabel('Summary').fill('A summary for summer.')

  await expect(async () => {
    const copy = await content.getDocument<{summary?: string}>(`versions.${releaseId}.${note.id}`)
    expect(copy?.summary).toBe('A summary for summer.')
  }).toPass({timeout: 20_000})
  await expectDraft(content, note.id, (draft) => expect(draft.summary).toBe('A summary.'))
})

test('says the copy can’t change while its Release is scheduled', async ({page, post, content}) => {
  const releaseId = await releaseWith(content, post)
  test.skip(!releaseId, 'This project doesn’t have Content Releases.')
  const publishAt = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString()
  await content.releases.schedule({releaseId: releaseId!, publishAt})
  const room = new Room(page)
  await room.open(post, inRelease(releaseId!))

  await expect(page.getByText(new RegExp(`^In ${TITLE} · scheduled for `))).toBeVisible()
  await expect(page.getByText(/is scheduled for .*, so this Post can’t change\.$/)).toBeVisible()
  await expect(page.getByRole('status').getByRole('button', {name: 'Open in Structure'})).toBeVisible()

  await room.title.click()
  await page.keyboard.type('x')
  await expect(room.title).toHaveValue(post.title)
})

test('opens the Writer’s own copy, and says so, when the Post isn’t in the Release', async ({page, post}) => {
  const room = new Room(page)
  await room.open(post, inRelease('rNotThere1'))

  await expect(page.getByText(/isn’t in that release, so this is its own copy\.$/)).toBeVisible()
  await expect(page.getByRole('button', {name: 'Publish', exact: true})).toBeVisible()
})
