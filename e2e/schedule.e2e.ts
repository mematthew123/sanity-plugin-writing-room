import {type SanityClient} from '@sanity/client'
import {expect, expectDraft, test} from './fixtures'
import {Room} from './room'

interface Release {
  _id: string
  name: string
  state: string
  publishAt?: string
  metadata: {cardinality?: string; intendedPublishAt?: string}
}

async function releasesOf(content: SanityClient, id: string): Promise<Release[]> {
  return content.fetch(
    `*[_type == "system.release" && metadata.cardinality == "one"
      && defined(*[_id == "versions." + ^.name + "." + $id][0]._id)]`,
    {id},
  )
}

const NO_SCHEDULED_DRAFTS = 'This project doesn’t have scheduled drafts.'

/** What Studio asks before it offers scheduled drafts. Anything else that goes wrong is a failure. */
async function hasScheduledDrafts(content: SanityClient): Promise<boolean> {
  const features = await content.request<string[]>({uri: '/features', tag: 'features'})
  return features.includes('singleDocRelease')
}

async function sweepSchedules(content: SanityClient, id: string) {
  for (const release of await releasesOf(content, id)) {
    const releaseId = release.name
    if (release.state === 'scheduled') await content.releases.unschedule({releaseId}).catch(() => undefined)
    await content.discardVersion({releaseId, publishedId: id}).catch(() => undefined)
    await content.releases.archive({releaseId}).catch(() => undefined)
    await content.releases.delete({releaseId}).catch(() => undefined)
  }
}

test('schedules from the ask-once panel, locks the room, and unlocks back to a draft', async ({
  page,
  post,
  content,
}) => {
  const room = new Room(page)
  await room.open(post)

  await page.getByRole('button', {name: 'Publish', exact: true}).click()
  const scheduleInstead = page.getByRole('button', {name: 'Schedule for later'})
  await expect(page.getByRole('button', {name: 'Publish now'})).toBeVisible()
  test.skip(!(await scheduleInstead.isVisible()), NO_SCHEDULED_DRAFTS)

  try {
    await scheduleInstead.click()
    await expect(page.getByLabel(/goes live by itself, at/)).toHaveValue(/T09:00$/)
    await page.getByRole('button', {name: 'Schedule', exact: true}).click()

    await expect(page.getByText(/^Scheduled · /)).toBeVisible({timeout: 30_000})
    await expect(page.getByRole('button', {name: 'Unlock'})).toBeVisible()
    await expect(page.getByRole('button', {name: 'Publish', exact: true})).toHaveCount(0)

    const [release] = await releasesOf(content, post.id)
    expect(release?.state).toBe('scheduled')
    const version = await content.getDocument<{publishedAt?: string; slug?: {current?: string}}>(
      `versions.${release!.name}.${post.id}`,
    )
    expect(new Date(version!.publishedAt!).getTime()).toBe(new Date(release!.publishAt!).getTime())
    expect(version?.slug?.current).toMatch(/^e2e-/)

    await expect(room.title).toHaveValue(post.title)
    const lockedBody = page.getByLabel('Body')
    await expect(lockedBody).toContainText('Paragraph 1.')
    await lockedBody.click()
    await page.keyboard.type('qqq')
    await expect(page.getByText('is scheduled. Unlock it to make changes.')).toBeVisible()
    await expect(lockedBody).not.toContainText('qqq')

    await room.openDetails()
    await expect(page.getByLabel('Slug')).toHaveValue(/^e2e-/)
    await expect(page.getByLabel('Slug')).not.toBeEditable()
    await room.back.click()

    await page.goto('/writing-room')
    await expect(page.getByText(/^Scheduled · /).first()).toBeVisible({timeout: 30_000})
    await page.goto(post.roomPath)
    await expect(page.getByRole('button', {name: 'Unlock'})).toBeVisible({timeout: 45_000})

    await page.getByRole('button', {name: 'Unlock'}).click()
    await expect(page.getByText(/Unlocking takes it off the schedule/)).toBeVisible()
    await page.getByRole('dialog').getByRole('button', {name: 'Unlock'}).click()

    await expect(page.getByRole('button', {name: 'Publish', exact: true})).toBeVisible({timeout: 30_000})
    await expect(page.getByText('Draft', {exact: true}).first()).toBeVisible()
    await expect(async () => {
      expect(await releasesOf(content, post.id)).toHaveLength(0)
    }).toPass({timeout: 15_000})
    await expectDraft(content, post.id, (draft) => {
      expect(draft.publishedAt).toBeUndefined()
      expect((draft.slug as {current?: string} | undefined)?.current).toMatch(/^e2e-/)
    })
    expect(await content.getDocument(post.id)).toBeFalsy()

    await room.body.click()
    await page.keyboard.press('ControlOrMeta+ArrowDown')
    await page.keyboard.type(' Written after unlocking.')
    await expect(room.body).toContainText('Written after unlocking.')
    await page.getByRole('button', {name: 'Publish', exact: true}).click()
    await page.getByRole('button', {name: 'Schedule for later'}).click()
    await expect(page.getByLabel(/goes live by itself, at/)).toHaveValue(/T09:00$/)
    await page.getByRole('button', {name: 'Not yet'}).click()
  } finally {
    await sweepSchedules(content, post.id)
  }
})

test('a schedule left hanging locks the room until the Writer unlocks it', async ({page, post, content}) => {
  test.setTimeout(180_000)
  test.skip(!(await hasScheduledDrafts(content)), NO_SCHEDULED_DRAFTS)
  const {releaseId} = await content.releases.create({
    metadata: {
      title: 'Scheduled publish',
      releaseType: 'scheduled',
      cardinality: 'one',
      intendedPublishAt: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString(),
    },
  })

  try {
    const draft = await content.getDocument<Record<string, unknown>>(`drafts.${post.id}`)
    const {_rev, _updatedAt, _createdAt, ...body} = draft!
    await content.createVersion({
      publishedId: post.id,
      releaseId,
      document: {...body, _id: `versions.${releaseId}.${post.id}`, title: `${post.title}, as scheduled`} as never,
    })

    await page.goto(post.roomPath)
    const room = new Room(page)
    await expect(page.getByText('Not scheduled · won’t go live')).toBeVisible({timeout: 90_000})
    await expect(room.title).toHaveValue(`${post.title}, as scheduled`)

    await page.getByRole('button', {name: 'Unlock'}).click()
    await expect(page.getByText(/It isn’t scheduled just now/)).toBeVisible()
    await page.getByRole('dialog').getByRole('button', {name: 'Unlock'}).click()

    await expect(page.getByRole('button', {name: 'Publish', exact: true})).toBeVisible({timeout: 30_000})
    await expectDraft(content, post.id, (now) => expect(now.title).toBe(`${post.title}, as scheduled`))
    await expect(room.title).toHaveValue(`${post.title}, as scheduled`)
    expect(await releasesOf(content, post.id)).toHaveLength(0)
  } finally {
    await sweepSchedules(content, post.id)
    await content.releases.archive({releaseId}).catch(() => undefined)
    await content.releases.delete({releaseId}).catch(() => undefined)
  }
})

async function goLiveOnASchedule(
  content: SanityClient,
  id: string,
  made: (releaseId: string) => void,
): Promise<void> {
  const {releaseId} = await content.releases.create({
    metadata: {
      title: 'Scheduled publish',
      releaseType: 'scheduled',
      cardinality: 'one',
      intendedPublishAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    },
  })
  made(releaseId)
  await content.createVersion({publishedId: id, baseId: `drafts.${id}`, releaseId})
  await content.releases.publish({releaseId})
  await expect(async () => {
    expect(await content.getDocument(id), 'it went live').toBeTruthy()
  }).toPass({timeout: 30_000})
}

test('reads as published once a schedule has gone live, with nothing left to publish', async ({
  page,
  post,
  content,
}) => {
  test.skip(!(await hasScheduledDrafts(content)), NO_SCHEDULED_DRAFTS)
  let releaseId: string | undefined
  try {
    await goLiveOnASchedule(content, post.id, (made) => {
      releaseId = made
    })

    await new Room(page).open(post)

    await expect(page.getByText('Published', {exact: true})).toBeVisible()
    await expect(page.getByRole('button', {name: 'Publish changes'})).toHaveCount(0)
    await expect(page.getByRole('button', {name: 'Unlock'})).toHaveCount(0)
    expect(await content.getDocument(`drafts.${post.id}`)).toBeFalsy()
  } finally {
    if (releaseId) {
      // Published, there is only the release to delete. Cut short, its version and the release are still there.
      await content.discardVersion({releaseId, publishedId: post.id}).catch(() => undefined)
      await content.releases.archive({releaseId}).catch(() => undefined)
      await content.releases.delete({releaseId}).catch(() => undefined)
    }
  }
})
