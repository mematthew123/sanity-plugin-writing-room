import {missing} from './env'
import {contentClient, ID_PREFIX} from './content'

const STALE_AFTER_MS = 60 * 60 * 1000

/** Removes what an interrupted run left behind. Only ever touches documents the tests made. */
export default async function globalSetup() {
  if (missing) {
    console.warn(`\n${missing}\n`)
    return
  }
  const content = contentClient()
  const before = new Date(Date.now() - STALE_AFTER_MS).toISOString()
  const stale = await content.fetch<string[]>(
    // A prefix, exactly: `match` reads an id as words, and would take `guide-e2e-testing` too.
    '*[(string::startsWith(_id, $published) || string::startsWith(_id, $drafts)) && _updatedAt < $before]._id',
    {published: ID_PREFIX, drafts: `drafts.${ID_PREFIX}`, before},
  )
  if (stale.length === 0) return
  const sweep = content.transaction()
  for (const id of stale) sweep.delete(id)
  await sweep.commit()
}
