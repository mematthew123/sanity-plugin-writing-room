import {defineBehavior} from '@portabletext/editor/behaviors'
import {BehaviorPlugin} from '@portabletext/editor/plugins'
import {type DocumentHandle, useDocument, useEditDocument} from '@sanity/sdk-react'
import {type Dispatch, type SetStateAction, useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {type SanityClient, type SchemaType, useClient, useSchema} from 'sanity'
import {resolveSortingEndpoint, useWritingRoomConfig} from '../../config'
import {API_VERSION} from '../../lib/api-version'
import {LIMITS, SORTING_VERSION, type SortingRequest, type SortingResponse} from '../../sorting/contract'
import {edgesOf} from '../../sorting/edges'
import {slugByHand} from '../details/slug-by-hand'
import {type WritingFields} from '../fields'
import {type RoomNotice} from '../room-status'
import {applySorting, contentOf, type Sorted, sortedMessage} from './apply'
import {sortingMarks} from './marks'
import {labelQuery, type SortableField, sortableFields} from './sortable-fields'
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
    // No storage: the longer offer shows again next time.
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

const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length

/**
 * The fields that fit in one request. The route reads only so much, and answers are most of it,
 * so past that the field with the most answers is left out, and the rest are still sorted.
 */
function thatFit(sortable: SortableField[], rest: Omit<SortingRequest, 'fields'>): SortableField[] {
  let fits = sortable
  // Headroom for the request's own keys.
  const room = LIMITS.body - bytes({...rest, fields: []}) - 1024
  while (fits.length > 0 && bytes(fits.map((entry) => entry.field)) > room) {
    const answers = (entry: SortableField) => (entry.field.kind === 'pick' ? entry.field.options.length : 0)
    const most = fits.reduce((a, b) => (answers(b) > answers(a) ? b : a))
    if (answers(most) === 0) break
    fits = fits.filter((entry) => entry !== most)
  }
  return fits
}

const wordsIn = (body: unknown) => writtenBlocks(body).map((block) => block.text).join('\n')

/**
 * The answers a reference field offers: the documents it can point to, by the name they go by.
 * A field whose answers can't be read (a type this Writer may not see) is left out, not fatal.
 */
async function withAnswers(
  sortable: SortableField[],
  client: SanityClient,
  getSchemaType: (name: string) => SchemaType | undefined,
  signal: AbortSignal,
): Promise<SortableField[]> {
  const loaded = await Promise.all(
    sortable.map(async (entry): Promise<SortableField | null> => {
      if (!entry.from || entry.field.kind !== 'pick') return entry
      const label = labelQuery(entry.from, getSchemaType)
      let documents: Array<{_id: string; _type: string; label?: unknown}>
      try {
        documents = await client.fetch(
          `*[_type in $types && !(_id in path("drafts.**")) && !(_id in path("versions.**"))] | order(_id) [0...${LIMITS.options + 1}]{_id, _type, "label": ${label}}`,
          {types: entry.from},
          {signal},
        )
      } catch (error) {
        // An abort stops the whole sort; any other error costs only this field.
        if (signal.aborted) throw error
        return null
      }
      // More answers than one question can offer.
      if (documents.length > LIMITS.options) return null
      const options = documents.flatMap((document) =>
        typeof document.label === 'string' && document.label.trim() ? [{id: document._id, label: document.label.trim()}] : [],
      )
      const answerTypes = Object.fromEntries(documents.map((document) => [document._id, document._type]))
      return options.length > 0 ? {...entry, field: {...entry.field, options}, answerTypes} : null
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
 * See DESIGN.md.
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
  onNotice: Dispatch<SetStateAction<RoomNotice | null>>
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

  // Tell whoever set Sorting up why it's silent, once.
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
  /** The body as it was when the offer was made. */
  const watched = useRef('')
  /**
   * The way back. `touched` is what Undo puts back; `unsorted` and `sorted` are the whole document's
   * content before and after, since any edit ends Undo; `landed` is whether the room has shown the
   * sorted document yet, which it may not have on the first render.
   */
  const undo = useRef<{
    before: Record<string, unknown>
    touched: string[]
    unsorted: string
    sorted: string
    landed: boolean
  } | null>(null)
  const abort = useRef<AbortController | null>(null)
  const latest = useRef(document)
  const seeDetails = useRef(onSeeDetails)
  useEffect(() => {
    latest.current = document
    seeDetails.current = onSeeDetails
  })

  // Read only inside effects: this component re-renders on every keystroke.
  const body = document?.[writing.body]

  // Dismiss only Sorting's own notice; the room may be showing another by now.
  const mine = useRef<RoomNotice | null>(null)
  const show = useCallback(
    (notice: RoomNotice) => {
      mine.current = notice
      onNotice(notice)
    },
    [onNotice],
  )
  const dismiss = useCallback(() => {
    const shown = mine.current
    mine.current = null
    if (shown) onNotice((current) => (current === shown ? null : current))
  }, [onNotice])

  // Whether the body was empty can only be known before the paste lands.
  const behaviors = useMemo(
    () => [
      defineBehavior({
        on: 'clipboard.paste',
        guard: ({snapshot}) => {
          if (bodyIsEmpty(snapshot.context.value)) {
            pastedAt.current = Date.now()
            queueMicrotask(() => setPastes((count) => count + 1))
          } else {
            // A paste into words already there is never a whole piece, even on the heels of one that
            // went into an empty body and wasn't a piece itself.
            pastedAt.current = 0
          }
          // Never handles the paste.
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
    show({text: 'Sorting…', stays: true})
    const wordsOf = (document: Record<string, unknown>) =>
      writtenBlocks(document[writing.body]).map((block) => `${block.id} ${block.text}`).join('\n')
    const startedWith = wordsOf(before)
    try {
      const edges: Omit<SortingRequest, 'fields'> = {version: SORTING_VERSION, ...edgesOf(writtenBlocks(before[writing.body]))}
      const sortable = thatFit(
        await withAnswers(
          sortableFields(schema.get(handle.documentType), before, writing),
          client,
          (name) => schema.get(name),
          controller.signal,
        ),
        edges,
      )
      const endpoint = resolveSortingEndpoint(sorting.endpoint)
      if (!endpoint) throw new Error('The Sorting endpoint is invalid.')
      const request: SortingRequest = {...edges, fields: sortable.map((entry) => entry.field)}
      const [response] = await Promise.all([
        fetch(endpoint, {
          method: 'POST',
          redirect: 'error',
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

      // Read and written in one step, against the document as the store has it now: a
      // collaborator's edit can arrive before this component has rendered it.
      const outcome: {changed?: boolean; now?: Record<string, unknown>; sorted?: Sorted} = {}
      edit((current) => {
        const now = current ?? before
        if (wordsOf(now) !== startedWith) {
          outcome.changed = true
          return now
        }
        const result = applySorting({
          document: now,
          writing,
          sortable,
          response,
          isPublished,
          slugByHand: slugByHand.read(handle.documentId) ?? undefined,
          keyGenerator: randomKey,
        })
        if (result.touched.length === 0) return now
        outcome.now = now
        outcome.sorted = result
        // Differs from `now` only in the touched keys.
        return result.next
      })
      const {now, sorted} = outcome
      if (!now || !sorted) {
        setPhase('idle')
        show({text: outcome.changed ? CHANGED : NOTHING})
        return
      }
      sortingMarks.set(handle.documentId, Object.fromEntries(sorted.filledNames.map((name) => [name, sorted.next[name]])))
      undo.current = {
        before: now,
        touched: sorted.touched,
        unsorted: contentOf(now),
        sorted: contentOf(sorted.next),
        landed: false,
      }
      setPhase('sorted')
      const putBack = () => {
        const kept = undo.current
        undo.current = null
        sortingMarks.clear(handle.documentId)
        setPhase('idle')
        dismiss()
        if (!kept) return
        edit((current) => {
          // Edited since, in a copy this component may not have rendered yet: leave it be.
          if (contentOf(current) !== kept.sorted) return current ?? {}
          const restored: Record<string, unknown> = {...current}
          for (const key of kept.touched) {
            if (kept.before[key] === undefined) delete restored[key]
            else restored[key] = kept.before[key]
          }
          return restored
        })
      }
      show({
        text: sortedMessage(sorted) ?? 'Sorted. Removed the duplicate headline.',
        done: true,
        stays: true,
        actions: [
          ...(sorted.filled.length > 0 ? [{label: 'See Details', onClick: () => seeDetails.current()}] : []),
          {label: 'Undo', onClick: putBack},
        ],
      })
    } catch {
      setPhase('idle')
      // Esc needs no message; a timeout does.
      const stopped = controller.signal.aborted && abort.current === null
      if (stopped) dismiss()
      else show({text: COULD_NOT})
    } finally {
      clearTimeout(tooLong)
      abort.current = null
      onHolding(false)
    }
  }, [sorting, token, schema, client, handle.documentId, handle.documentType, writing, isPublished, edit, onHolding, show, dismiss])

  // A ref, so a re-render never restarts the wait below.
  const sortNow = useRef(sort)
  useEffect(() => {
    sortNow.current = sort
  })

  // Offer once the paste has settled, if the body was empty before and holds a piece now.
  useEffect(() => {
    if (!enabled || phase !== 'idle' || !pastedAt.current) return undefined
    if (Date.now() - pastedAt.current > PASTE_GIVE_UP_MS) {
      pastedAt.current = 0
      return undefined
    }
    const still = setTimeout(() => {
      if (!isWholePiece(body)) return
      pastedAt.current = 0
      // Words only: keys and marks settle after a paste.
      watched.current = wordsIn(body)
      setPhase('offered')
      show({text: hasAccepted() ? OFFER : FIRST_OFFER, action: {label: 'Sort', onClick: () => void sortNow.current()}})
    }, PASTE_STILL_MS)
    return () => clearTimeout(still)
  }, [enabled, phase, pastes, body, show])

  // Writing on declines the offer.
  useEffect(() => {
    if (phase !== 'offered' || wordsIn(body) === watched.current) return
    setPhase('idle')
    dismiss()
  }, [phase, body, dismiss])

  // The first edit, anywhere in the document, ends Undo and takes the message away: Undo is the
  // way back to the paste as it landed, and the message mustn't sit there while the Writer writes.
  // Told by content, not timing.
  useEffect(() => {
    const kept = undo.current
    if (phase !== 'sorted' || !kept) return
    const now = contentOf(document)
    if (now === kept.sorted) {
      kept.landed = true
      return
    }
    // The sorted document hasn't rendered yet.
    if (!kept.landed && now === kept.unsorted) return
    undo.current = null
    setPhase('idle')
    dismiss()
  }, [phase, document, dismiss])

  // Leaving the room or the document stops a sort in flight and clears the marks.
  useEffect(
    () => () => {
      const controller = abort.current
      abort.current = null
      controller?.abort()
      sortingMarks.clear(handle.documentId)
    },
    [handle.documentId],
  )

  // Esc ends the hold without also leaving the room.
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
