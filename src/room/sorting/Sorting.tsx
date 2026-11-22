import {defineBehavior} from '@portabletext/editor/behaviors'
import {BehaviorPlugin} from '@portabletext/editor/plugins'
import {type DocumentHandle, useDocument, useEditDocument} from '@sanity/sdk-react'
import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {type SanityClient, type SchemaType, useClient, useSchema} from 'sanity'
import {useWritingRoomConfig} from '../../config'
import {API_VERSION} from '../../lib/api-version'
import {LIMITS, SORTING_VERSION, type SortingRequest, type SortingResponse} from '../../sorting/contract'
import {edgesOf} from '../../sorting/edges'
import {slugByHand} from '../details/slug-by-hand'
import {type WritingFields} from '../fields'
import {type RoomNotice} from '../room-status'
import {applySorting, contentOf, sortedMessage} from './apply'
import {labelPaths, type SortableField, sortableFields} from './sortable-fields'
import {bodyIsEmpty, isWholePiece, writtenBlocks} from './whole-piece'

/** Long enough not to flicker, short enough that a slow answer is given up on. */
const HOLD_AT_LEAST_MS = 400
const HOLD_AT_MOST_MS = 8000
/**
 * A paste reaches the document in more than one step, so the room waits for the body to hold
 * still this long before it reads it, and gives up if it never shows a piece.
 */
const PASTE_STILL_MS = 600
const PASTE_GIVE_UP_MS = 6000
/** The same goes for Sorting's own change: what follows it at once is its echo, not an edit. */
const APPLY_SETTLES_MS = 1500

/** One key for every Studio: storage is already per origin. */
const ACCEPTED_KEY = 'sanity-plugin-writing-room:sorting-accepted'

function hasAccepted(): boolean {
  try {
    return window.localStorage.getItem(ACCEPTED_KEY) === '1'
  } catch {
    return false
  }
}

function rememberAccepted() {
  try {
    window.localStorage.setItem(ACCEPTED_KEY, '1')
  } catch {
    // Storage unavailable: the longer line is shown again next time, which is harmless.
  }
}

const OFFER = 'Pasted a whole piece. Sort it into the title and Details?'
/** The first time, the Writer is told where their words will go. */
const FIRST_OFFER =
  'Pasted a whole piece. The room can sort it into the title and Details, using the AI service this Studio has set up.'
const COULD_NOT = 'Couldn’t sort this just now. Your words are all here.'
const CHANGED = 'This changed while it was being sorted, so it’s been left as it is.'
const NOTHING = 'There was nothing here to sort into the title or Details.'

const randomKey = () => Math.random().toString(36).slice(2, 14)

/** The answers a reference field offers: the documents it can point to, by the name they go by. */
async function withAnswers(
  sortable: SortableField[],
  client: SanityClient,
  getSchemaType: (name: string) => SchemaType | undefined,
  signal: AbortSignal,
): Promise<SortableField[]> {
  const loaded = await Promise.all(
    sortable.map(async (entry): Promise<SortableField | null> => {
      if (!entry.from || entry.field.kind !== 'pick') return entry
      const label = labelPaths(entry.from, getSchemaType).join(', ')
      const documents = await client.fetch<Array<{_id: string; label?: unknown}>>(
        `*[_type in $types && !(_id in path("drafts.**")) && !(_id in path("versions.**"))] | order(_id) [0...${LIMITS.options + 1}]{_id, "label": coalesce(${label})}`,
        {types: entry.from},
        {signal},
      )
      // More answers than one question can offer: narrowing them down is a search, not Sorting.
      if (documents.length > LIMITS.options) return null
      const options = documents.flatMap((document) =>
        typeof document.label === 'string' && document.label.trim() ? [{id: document._id, label: document.label.trim()}] : [],
      )
      return options.length > 0 ? {...entry, field: {...entry.field, options}} : null
    }),
  )
  return loaded.filter((entry): entry is SortableField => entry !== null)
}

function isResponse(value: unknown): value is SortingResponse {
  const response = value as Partial<SortingResponse> | null
  return (
    !!response &&
    response.version === SORTING_VERSION &&
    Array.isArray(response.placed) &&
    Array.isArray(response.picked) &&
    Array.isArray(response.listed)
  )
}

type Phase = 'idle' | 'offered' | 'holding' | 'sorted'

let saidWhyOff = false

/**
 * Sorting, in the room: after a whole-piece paste into an empty body it offers once, and on a yes
 * holds the page, asks the Studio's own route where the parts belong, and applies the answer. It
 * renders nothing of its own. Only in a Studio that has set Sorting up; anywhere else, and for a
 * Writer signed in without a token to show the route, the room is as it always was.
 * See docs/sorting-plan.md and DESIGN.md.
 */
export function Sorting({
  handle,
  writing,
  locked,
  isPublished,
  onNotice,
  onHolding,
  onSeeDetails,
}: {
  handle: DocumentHandle
  writing: WritingFields
  locked: boolean
  isPublished: boolean
  onNotice: (notice: RoomNotice | null) => void
  onHolding: (holding: boolean) => void
  onSeeDetails: () => void
}) {
  const {sorting} = useWritingRoomConfig()
  const client = useClient({apiVersion: API_VERSION})
  const token = client.config().token
  const schema = useSchema()
  const {data: document} = useDocument<Record<string, unknown>>(handle)
  const edit = useEditDocument<Record<string, unknown>>(handle)
  const enabled = !!sorting && !!token && !locked

  // Set up but silent is a puzzle for whoever set it up, so say why, once, where they will look.
  useEffect(() => {
    if (sorting && !token && !saidWhyOff) {
      saidWhyOff = true
      console.info(
        '[sanity-plugin-writing-room] Sorting is set up, but this sign-in uses a cookie and has no token to show the Sorting route, so the room won’t offer it. Signing in with a token (`auth: {loginMethod: "token"}` in the Studio config) turns it on.',
      )
    }
  }, [sorting, token])

  const [phase, setPhase] = useState<Phase>('idle')
  const [pastes, setPastes] = useState(0)
  const pastedAt = useRef(0)
  /** The body as it was when the offer was made, or the document as Sorting left it. */
  const watched = useRef('')
  const undo = useRef<{before: Record<string, unknown>; touched: string[]} | null>(null)
  const abort = useRef<AbortController | null>(null)
  const latest = useRef(document)
  const seeDetails = useRef(onSeeDetails)
  useEffect(() => {
    latest.current = document
    seeDetails.current = onSeeDetails
  })

  const body = document?.[writing.body]
  // The words only: keys and marks settle after a paste, and settling isn't the Writer writing on.
  const bodyWords = useMemo(() => writtenBlocks(body).map((block) => block.text).join('\n'), [body])
  const appliedAt = useRef(0)
  const content = useMemo(() => contentOf(document), [document])

  // Whether the body was empty is only knowable before the paste lands, so it's noted on the way in.
  const behaviors = useMemo(
    () => [
      defineBehavior({
        on: 'clipboard.paste',
        guard: ({snapshot}) => {
          if (bodyIsEmpty(snapshot.context.value)) {
            pastedAt.current = Date.now()
            queueMicrotask(() => setPastes((count) => count + 1))
          }
          // Never handles the paste: it lands exactly as it would have.
          return false
        },
        actions: [],
      }),
    ],
    [],
  )

  const sort = useCallback(async () => {
    const before = latest.current
    if (!sorting || !token || !before) return
    rememberAccepted()
    const controller = new AbortController()
    abort.current = controller
    const tooLong = setTimeout(() => controller.abort(), HOLD_AT_MOST_MS)
    setPhase('holding')
    onHolding(true)
    onNotice({text: 'Sorting…', stays: true})
    const wordsOf = (document: Record<string, unknown>) =>
      writtenBlocks(document[writing.body]).map((block) => `${block.id} ${block.text}`).join('\n')
    const startedWith = wordsOf(before)
    try {
      const sortable = await withAnswers(
        sortableFields(schema.get(handle.documentType), before, writing),
        client,
        (name) => schema.get(name),
        controller.signal,
      )
      const request: SortingRequest = {
        version: SORTING_VERSION,
        ...edgesOf(writtenBlocks(before[writing.body])),
        fields: sortable.map((entry) => entry.field),
      }
      const [response] = await Promise.all([
        fetch(sorting.endpoint, {
          method: 'POST',
          headers: {'content-type': 'application/json', authorization: `Bearer ${token}`},
          body: JSON.stringify(request),
          signal: controller.signal,
        }).then(async (answer) => {
          const json: unknown = answer.ok ? await answer.json() : null
          if (!isResponse(json)) throw new Error('The Sorting route did not answer.')
          return json
        }),
        new Promise((resolve) => setTimeout(resolve, HOLD_AT_LEAST_MS)),
      ])
      if (controller.signal.aborted) throw new DOMException('Stopped', 'AbortError')

      const now = latest.current ?? before
      if (wordsOf(now) !== startedWith) {
        setPhase('idle')
        onNotice({text: CHANGED})
        return
      }
      const sorted = applySorting({
        document: now,
        writing,
        sortable,
        response,
        isPublished,
        slugByHand: slugByHand.read(handle.documentId) ?? undefined,
        keyGenerator: randomKey,
      })
      const message = sortedMessage(sorted)
      if (!message || sorted.touched.length === 0) {
        setPhase('idle')
        onNotice({text: NOTHING})
        return
      }
      // Only what Sorting changed, laid over the document as it is this instant.
      edit((current) => {
        const next: Record<string, unknown> = {...(current ?? {})}
        for (const key of sorted.touched) next[key] = sorted.next[key]
        return next
      })
      undo.current = {before: now, touched: sorted.touched}
      watched.current = contentOf(sorted.next)
      appliedAt.current = Date.now()
      setPhase('sorted')
      const putBack = () => {
        const kept = undo.current
        undo.current = null
        setPhase('idle')
        onNotice(null)
        if (!kept) return
        edit((current) => {
          const restored: Record<string, unknown> = {...(current ?? {})}
          for (const key of kept.touched) {
            if (kept.before[key] === undefined) delete restored[key]
            else restored[key] = kept.before[key]
          }
          return restored
        })
      }
      onNotice({
        text: message,
        done: true,
        stays: true,
        actions: [
          ...(sorted.filled.length > 0 ? [{label: 'See Details', onClick: () => seeDetails.current()}] : []),
          {label: 'Undo', onClick: putBack},
        ],
      })
    } catch {
      setPhase('idle')
      // Esc is the Writer's own doing and needs no message; running out of time is not.
      const stopped = controller.signal.aborted && abort.current === null
      onNotice(stopped ? null : {text: COULD_NOT})
    } finally {
      clearTimeout(tooLong)
      abort.current = null
      onHolding(false)
    }
  }, [sorting, token, schema, client, handle.documentId, handle.documentType, writing, isPublished, edit, onHolding, onNotice])

  // Read through a ref, so a new function from a re-render never restarts the wait below.
  const sortNow = useRef(sort)
  useEffect(() => {
    sortNow.current = sort
  })

  // The offer: once the paste has landed and the body has held still, if it was empty before and
  // holds a piece now.
  useEffect(() => {
    if (!enabled || phase !== 'idle' || !pastedAt.current) return undefined
    if (Date.now() - pastedAt.current > PASTE_GIVE_UP_MS) {
      pastedAt.current = 0
      return undefined
    }
    const still = setTimeout(() => {
      if (!isWholePiece(body)) return
      pastedAt.current = 0
      watched.current = bodyWords
      setPhase('offered')
      onNotice({text: hasAccepted() ? OFFER : FIRST_OFFER, action: {label: 'Sort', onClick: () => void sortNow.current()}})
    }, PASTE_STILL_MS)
    return () => clearTimeout(still)
  }, [enabled, phase, pastes, body, bodyWords, onNotice])

  // Going on writing is a no: the offer goes away.
  useEffect(() => {
    if (phase !== 'offered' || bodyWords === watched.current) return
    setPhase('idle')
    onNotice(null)
  }, [phase, bodyWords, onNotice])

  // The first edit, by anyone, ends Undo: putting the paste back would take that edit with it.
  useEffect(() => {
    if (phase !== 'sorted' || content === watched.current) return
    if (Date.now() - appliedAt.current < APPLY_SETTLES_MS) {
      watched.current = content
      return
    }
    undo.current = null
    setPhase('idle')
    onNotice(null)
  }, [phase, content, onNotice])

  // Esc ends the hold and nothing else: it mustn't also leave the room.
  useEffect(() => {
    if (phase !== 'holding') return undefined
    const stop = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      const controller = abort.current
      abort.current = null
      controller?.abort()
    }
    window.addEventListener('keydown', stop, true)
    return () => window.removeEventListener('keydown', stop, true)
  }, [phase])

  return enabled ? <BehaviorPlugin behaviors={behaviors} /> : null
}
