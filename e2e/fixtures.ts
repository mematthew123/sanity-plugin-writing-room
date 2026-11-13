import {randomUUID} from 'node:crypto'
import {expect, test as base} from '@playwright/test'
import {type SanityClient} from '@sanity/client'
import {contentClient, ID_PREFIX} from './content'
import {missing, projectId, token} from './env'

export interface TestPost {
  /** Without `drafts.`. */
  id: string
  title: string
  type: string
  /** `/writing-room/<id>`, with the type in the path for anything but a Post. */
  roomPath: string
}

const paragraph = (text: string, index: number) => ({
  _type: 'block',
  _key: `p${index}`,
  style: 'normal',
  markDefs: [],
  children: [{_type: 'span', _key: `s${index}`, text, marks: []}],
})

export const test = base.extend<{
  needsStudio: void
  content: SanityClient
  /** Makes a draft Post for this test alone and removes it, published copy included, afterwards. */
  makePost: (options?: {
    type?: 'post' | 'fieldNote'
    paragraphs?: number
    fields?: Record<string, unknown>
  }) => Promise<TestPost>
  post: TestPost
  /** A Field Note, which has the simple Details fields a Post doesn't. */
  note: TestPost
}>({
  needsStudio: [
    async ({}, provide, testInfo) => {
      testInfo.skip(!!missing, missing ?? '')
      await provide()
    },
    {auto: true},
  ],

  // The Studio reads its login from here, so the tests never go through a sign-in page.
  context: async ({context}, provide) => {
    await context.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [`__studio_auth_token_${projectId}`, JSON.stringify({token})] as const,
    )
    await provide(context)
  },

  content: async ({}, provide) => {
    await provide(contentClient())
  },

  makePost: async ({content, page}, provide, testInfo) => {
    const made: string[] = []
    await provide(async ({type = 'post', paragraphs = 2, fields = {}} = {}) => {
      const id = `${ID_PREFIX}${randomUUID()}`
      const title = `E2E ${testInfo.title.slice(0, 60)}`
      await content.create({
        _id: `drafts.${id}`,
        _type: type,
        title,
        body: Array.from({length: paragraphs}, (_, index) =>
          paragraph(`Paragraph ${index + 1}. The quick brown fox jumps over the lazy dog, twice, slowly.`, index),
        ),
        ...fields,
      })
      made.push(id)
      return {id, title, type, roomPath: type === 'post' ? `/writing-room/${id}` : `/writing-room/${type}/${id}`}
    })
    // The room may still have an edit on its way; closed, it can't save the draft back after it's gone.
    if (made.length > 0) await page.close()
    for (const id of made) {
      await content.transaction().delete(`drafts.${id}`).delete(id).commit()
    }
  },

  post: async ({makePost}, provide) => {
    await provide(await makePost())
  },

  note: async ({makePost}, provide) => {
    await provide(await makePost({type: 'fieldNote', fields: {summary: 'A summary.'}}))
  },
})

/** The draft as the server has it, once it matches. Details and the Prose save through different stores. */
export async function expectDraft(
  content: SanityClient,
  id: string,
  matcher: (draft: Record<string, unknown>) => void,
) {
  await expect(async () => {
    const draft = await content.getDocument<Record<string, unknown>>(`drafts.${id}`)
    expect(draft, 'the draft exists').toBeTruthy()
    matcher(draft!)
  }).toPass({timeout: 15_000})
}

export {expect}
