import {describe, expect, it} from 'vitest'
import {readLetsActionRun, type SavedRead} from './saved-read'

/**
 * Mirrors StudioActionButton: a new lookup starts whenever the room's sync state or the Studio's
 * draft changes, and a read is kept with the lookup that made it.
 */
function waiting() {
  let lookup: object | null = null
  let read: SavedRead | null = null
  return {
    startLookup() {
      const started = {}
      lookup = started
      return started
    },
    finishRead(started: object, revision: string | null) {
      read = {lookup: started, revision}
    },
    canRun(draftRevision: string | null) {
      return readLetsActionRun(read, lookup, draftRevision)
    },
  }
}

describe('readLetsActionRun', () => {
  it('runs once the Studio’s draft reaches what the current lookup read', () => {
    const button = waiting()
    const first = button.startLookup() // draft at rev-x
    button.finishRead(first, 'rev-a')
    expect(button.canRun('rev-x')).toBe(false)

    const second = button.startLookup() // draft reaches rev-a
    button.finishRead(second, 'rev-a')
    expect(button.canRun('rev-a')).toBe(true)
  })

  it('ignores an older read when the draft reaches its revision after the room saved again', () => {
    const button = waiting()
    const first = button.startLookup() // draft at rev-x
    button.finishRead(first, 'rev-a') // the server is at rev-a for now

    // The room saves again, so the server moves on to rev-b. Then the Studio's draft reaches
    // rev-a, which starts a new lookup in the same render. The old read must not count.
    button.startLookup()
    expect(button.canRun('rev-a')).toBe(false)
  })

  it('ignores a read made before the room’s sync state changed', () => {
    const button = waiting()
    const first = button.startLookup() // synced, draft at rev-a
    // The Writer types: the room is unsynced while the read is in flight, and it reads rev-a.
    button.startLookup()
    button.finishRead(first, 'rev-a')
    // The save lands (rev-b on the server) before the Studio's store catches up.
    button.startLookup()
    expect(button.canRun('rev-a')).toBe(false)
  })

  it('says nothing before anything was read', () => {
    expect(readLetsActionRun(null, {}, 'rev-a')).toBe(false)
  })

  it('treats a missing draft as a revision like any other', () => {
    const lookup = {}
    expect(readLetsActionRun({lookup, revision: null}, lookup, null)).toBe(true)
    expect(readLetsActionRun({lookup, revision: null}, lookup, 'rev-a')).toBe(false)
  })
})
