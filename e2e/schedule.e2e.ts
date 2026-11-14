import {expect, releasesOf, test} from './fixtures'
import {Room} from './room'

interface Release {
  state: string
  publishAt?: string
  metadata: {cardinality?: string; intendedPublishAt?: string}
}

test.beforeEach(async ({page, post}) => {
  const room = new Room(page)
  await room.open(post)
  await page.getByRole('button', {name: 'Publish', exact: true}).click()
  // A Studio whose plan or settings don't offer scheduling never shows the line, and that is right.
  await expect(page.getByRole('button', {name: 'Publish now'})).toBeVisible()
  test.skip(
    (await page.getByRole('button', {name: 'Choose a time'}).count()) === 0,
    'This Studio doesn’t offer scheduled drafts.',
  )
  await page.getByRole('button', {name: 'Choose a time'}).click()
})

test('schedules a Post for tomorrow morning, and leaves one copy of it', async ({page, post, content}) => {
  await expect(page.getByLabel('When it goes live')).toBeVisible()
  await page.getByRole('button', {name: 'Schedule', exact: true}).click()

  await expect(page.getByText(/^Scheduled for tomorrow at 9:00( am)?$/)).toBeVisible()
  await expect(page.getByRole('button', {name: 'Scheduled', exact: true})).toBeVisible()
  await expect(page.getByText(/^Scheduled · tomorrow at 9:00( am)?$/)).toBeVisible()

  await expect(async () => {
    const [releaseId, ...others] = await releasesOf(content, post.id)
    expect(releaseId, 'the Post is in a release').toBeTruthy()
    expect(others).toEqual([])
    const release = await content.releases.get({releaseId: releaseId!}) as Release | undefined
    expect(release?.state).toBe('scheduled')
    expect(release?.metadata.cardinality).toBe('one')

    const copy = await content.getDocument<{slug?: {current?: string}; publishedAt?: string}>(
      `versions.${releaseId}.${post.id}`,
    )
    expect(copy?.slug?.current).toMatch(/^e2e-/)
    // The date is the promised time, when readers first see it.
    expect(new Date(copy!.publishedAt!).getTime()).toBe(new Date(release!.publishAt!).getTime())
    expect(await content.getDocument(`drafts.${post.id}`), 'the draft is tidied away').toBeFalsy()
  }).toPass({timeout: 20_000})
})

test('says why typing does nothing in a Scheduled Post, and offers to edit it', async ({page, post, content}) => {
  await page.getByRole('button', {name: 'Schedule', exact: true}).click()
  await expect(page.getByRole('button', {name: 'Scheduled', exact: true})).toBeVisible()
  const room = new Room(page)
  await expect(room.title).toHaveValue(post.title)

  await room.title.click()
  await page.keyboard.type('x')
  await expect(room.title).toHaveValue(post.title)
  await expect(page.getByText(/is scheduled for tomorrow at 9:00( am)?\.$/)).toBeVisible()

  await page.getByRole('status').getByRole('button', {name: 'Edit it'}).click()

  // Off the schedule it is a Draft again, whose next step is to go back on.
  await expect(page.getByRole('button', {name: 'Schedule again'})).toBeVisible()
  await expect(async () => {
    const [releaseId] = await releasesOf(content, post.id)
    const release = await content.releases.get({releaseId: releaseId!}) as Release | undefined
    expect(release?.state).toBe('active')
    expect(release?.metadata.intendedPublishAt).toBeTruthy()
  }).toPass({timeout: 20_000})

  await room.title.fill(`${post.title}, fixed`)
  await page.getByRole('button', {name: 'Schedule again'}).click()
  // The panel opens on the time it was promised for.
  await page.getByRole('button', {name: 'Schedule', exact: true}).click()
  await expect(page.getByRole('button', {name: 'Scheduled', exact: true})).toBeVisible()

  await expect(async () => {
    const [releaseId] = await releasesOf(content, post.id)
    const release = await content.releases.get({releaseId: releaseId!}) as Release | undefined
    expect(release?.state).toBe('scheduled')
    const copy = await content.getDocument<{title?: string}>(`versions.${releaseId}.${post.id}`)
    expect(copy?.title).toBe(`${post.title}, fixed`)
  }).toPass({timeout: 20_000})
})

test('says "Not yet" to a time and nothing is scheduled', async ({page, post, content}) => {
  await page.getByRole('button', {name: 'Not yet'}).click()
  await expect(page.getByRole('button', {name: 'Schedule', exact: true})).toHaveCount(0)
  expect(await releasesOf(content, post.id)).toEqual([])
  expect(await content.getDocument(`drafts.${post.id}`)).toBeTruthy()
})
