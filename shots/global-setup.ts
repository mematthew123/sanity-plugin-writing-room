import {contentClient} from '../e2e/content'
import {missing} from '../e2e/env'

/** Every Post the captures make has an id that starts with this, so they can be swept up. */
export const ID_PREFIX = 'shots-'
/** The essay's picture is uploaded under this name, which is how a leftover one is found. */
export const PICTURE_FILENAME = 'shots-desk.png'

const STALE_AFTER_MS = 60 * 60 * 1000

/**
 * Removes what an interrupted run left behind: its draft Posts, and then the picture once nothing
 * refers to it. Only what is over an hour old, so a run that is still going keeps its own.
 */
export default async function globalSetup() {
  if (missing) {
    console.warn(`\n${missing}\n`)
    return
  }
  const content = contentClient()
  const before = new Date(Date.now() - STALE_AFTER_MS).toISOString()
  const posts = await content.fetch<string[]>(
    // A prefix, exactly: `match` reads an id as words.
    '*[(string::startsWith(_id, $published) || string::startsWith(_id, $drafts)) && _updatedAt < $before]._id',
    {published: ID_PREFIX, drafts: `drafts.${ID_PREFIX}`, before},
  )
  if (posts.length > 0) {
    const sweep = content.transaction()
    for (const id of posts) sweep.delete(id)
    await sweep.commit()
  }
  const pictures = await content.fetch<string[]>(
    '*[_type == "sanity.imageAsset" && originalFilename == $filename && _createdAt < $before && count(*[references(^._id)]) == 0]._id',
    {filename: PICTURE_FILENAME, before},
  )
  // One at a time: a run that started meanwhile may have taken a picture up again, and that one stays.
  for (const id of pictures) await content.delete(id).catch(() => undefined)
}
