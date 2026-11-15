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

/** The single-document releases holding a version of this document, however far along they are. */
async function releasesOf(content: SanityClient, id: string): Promise<Release[]> {
  return content.fetch(
    `*[_type == "system.release" && metadata.cardinality == "one"
      && defined(*[_id == "versions." + ^.name + "." + $id][0]._id)]`,
    {id},
  )
}

/** Takes a test's schedules apart again, so nothing it made goes live or lingers. */
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
  // A Studio without scheduled drafts (the project's plan, or its config) never offers this.
  test.skip(!(await scheduleInstead.isVisible()), 'This project doesn’t have scheduled drafts.')

  try {
    await scheduleInstead.click()
    // The panel opens on nine tomorrow morning; that is as good a time as any.
    await expect(page.getByLabel(/goes live by itself, at/)).toHaveValue(/T09:00$/)
    await page.getByRole('button', {name: 'Schedule', exact: true}).click()

    await expect(page.getByText(/^Scheduled · /)).toBeVisible({timeout: 30_000})
    await expect(page.getByRole('button', {name: 'Unlock'})).toBeVisible()
    await expect(page.getByRole('button', {name: 'Publish', exact: true})).toHaveCount(0)

    // Sanity has it as Studio would have made it, and the copy carries the date it goes live.
    const [release] = await releasesOf(content, post.id)
    expect(release?.state).toBe('scheduled')
    const version = await content.getDocument<{publishedAt?: string; slug?: {current?: string}}>(
      `versions.${release!.name}.${post.id}`,
    )
    expect(new Date(version!.publishedAt!).getTime()).toBe(new Date(release!.publishAt!).getTime())
    expect(version?.slug?.current).toMatch(/^e2e-/)

    // Locked: the words are there to read, and typing changes nothing but says why.
    await expect(room.title).toHaveValue(post.title)
    // A body that can't be edited isn't a textbox any more, so it is found by its label.
    const lockedBody = page.getByLabel('Body')
    await expect(lockedBody).toContainText('Paragraph 1.')
    await lockedBody.click()
    await page.keyboard.type('qqq')
    await expect(page.getByText('is scheduled. Unlock it to make changes.')).toBeVisible()
    await expect(lockedBody).not.toContainText('qqq')

    // Details shows the Scheduled version too, and doesn't take changes either.
    await room.openDetails()
    await expect(page.getByLabel('Slug')).toHaveValue(/^e2e-/)
    await expect(page.getByLabel('Slug')).not.toBeEditable()
    await room.back.click()

    // The Lobby says when it goes live.
    await page.goto('/writing-room')
    await expect(page.getByText(/^Scheduled · /).first()).toBeVisible({timeout: 30_000})
    await page.goto(post.roomPath)
    await expect(page.getByRole('button', {name: 'Unlock'})).toBeVisible({timeout: 45_000})

    await page.getByRole('button', {name: 'Unlock'}).click()
    await expect(page.getByText(/Unlocking takes it off the schedule/)).toBeVisible()
    await page.getByRole('dialog').getByRole('button', {name: 'Unlock'}).click()

    await expect(page.getByRole('button', {name: 'Publish', exact: true})).toBeVisible({timeout: 30_000})
    await expect(page.getByText('Draft', {exact: true}).first()).toBeVisible()
    // The Stale version and its release are gone, and the date the room stamped went with them.
    await expect(async () => {
      expect(await releasesOf(content, post.id)).toHaveLength(0)
    }).toPass({timeout: 15_000})
    await expectDraft(content, post.id, (draft) => {
      expect(draft.publishedAt).toBeUndefined()
      expect((draft.slug as {current?: string} | undefined)?.current).toMatch(/^e2e-/)
    })
    expect(await content.getDocument(post.id)).toBeFalsy()

    // Unlocked, it is an ordinary draft again, and the panel remembers the time it had.
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
  // The room gives an unscheduled release a minute before it calls it stale.
  test.setTimeout(180_000)
  // What Studio's "Pause to edit" leaves, or a scheduling that never finished: a release that isn't
  // scheduled, still holding a version. Its words are newer than the draft's.
  let releaseId: string
  try {
    const made = await content.releases.create({
      metadata: {
        title: 'Scheduled publish',
        releaseType: 'scheduled',
        cardinality: 'one',
        intendedPublishAt: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString(),
      },
    })
    releaseId = made.releaseId
  } catch {
    test.skip(true, 'This project doesn’t have scheduled drafts.')
    return
  }

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
    // A release is unscheduled for a moment in the ordinary way of things; the room waits a minute
    // before it calls one stale.
    await expect(page.getByText('Not scheduled · won’t go live')).toBeVisible({timeout: 90_000})
    await expect(room.title).toHaveValue(`${post.title}, as scheduled`)

    await page.getByRole('button', {name: 'Unlock'}).click()
    await expect(page.getByText(/It isn’t scheduled just now/)).toBeVisible()
    await page.getByRole('dialog').getByRole('button', {name: 'Unlock'}).click()

    await expect(page.getByRole('button', {name: 'Publish', exact: true})).toBeVisible({timeout: 30_000})
    // The version won: the draft now has what was going to go live.
    await expectDraft(content, post.id, (now) => expect(now.title).toBe(`${post.title}, as scheduled`))
    await expect(room.title).toHaveValue(`${post.title}, as scheduled`)
    expect(await releasesOf(content, post.id)).toHaveLength(0)
  } finally {
    await sweepSchedules(content, post.id)
    await content.releases.archive({releaseId}).catch(() => undefined)
    await content.releases.delete({releaseId}).catch(() => undefined)
  }
})

/** Has the document go live the way a schedule does: its release publishes. */
async function goLiveOnASchedule(content: SanityClient, id: string): Promise<string> {
  const {releaseId} = await content.releases.create({
    metadata: {
      title: 'Scheduled publish',
      releaseType: 'scheduled',
      cardinality: 'one',
      intendedPublishAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    },
  })
  await content.createVersion({publishedId: id, baseId: `drafts.${id}`, releaseId})
  await content.releases.publish({releaseId})
  await expect(async () => {
    expect(await content.getDocument(id), 'it went live').toBeTruthy()
  }).toPass({timeout: 30_000})
  return releaseId
}

test('reads as published once a schedule has gone live, with nothing left to publish', async ({
  page,
  post,
  content,
}) => {
  let releaseId: string | undefined
  try {
    releaseId = await goLiveOnASchedule(content, post.id).catch(() => undefined)
    test.skip(!releaseId, 'This project doesn’t have scheduled drafts.')

    await new Room(page).open(post)

    // Sanity clears away a draft nobody touched while it was scheduled; the room relies on that.
    await expect(page.getByText('Published', {exact: true})).toBeVisible()
    await expect(page.getByRole('button', {name: 'Publish changes'})).toHaveCount(0)
    await expect(page.getByRole('button', {name: 'Unlock'})).toHaveCount(0)
    expect(await content.getDocument(`drafts.${post.id}`)).toBeFalsy()
  } finally {
    if (releaseId) await content.releases.delete({releaseId}).catch(() => undefined)
  }
})
