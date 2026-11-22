import {AddIcon} from '@sanity/icons/Add'
import {ArrowRightIcon} from '@sanity/icons/ArrowRight'
import {
  discardDocument,
  type DocumentHandle,
  useApplyDocumentActions,
  useCreateDocument,
  useDocument,
  useDocumentProjection,
  useDocuments,
} from '@sanity/sdk-react'
import {Suspense, useEffect, useMemo, useRef, useState} from 'react'
import {useColorSchemeValue, useCurrentUser, useDataset, useProjectId} from 'sanity'
import {StateLink, useRouter} from 'sanity/router'
import {cameFromLobby} from './came-from'
import {Floating, FloatingSurface} from './editor/floating'
import {isEmptyPost} from './empty-post'
import {useWritingKinds, useWritingTypes, type WritingKind} from './kinds'
import {forgetLastOpened, readLastOpened} from './last-opened'
import {useLeaveToStudio} from './navigation'
import {NOT_SCHEDULED, type Schedule} from '../lib/schedule'
import {describePostStatus, type DocumentEditStatus, type PostStatus, statusText, timeAgo} from './post-status'
import {useSchedule} from './use-schedule'
import {Column, Placeholder, QuietButton, SectionLabel} from './primitives'
import {roomState} from './room-route'
import {countWords} from './word-count'
import styles from './Lobby.module.css'

/** One to continue, and a few more: the Lobby is a doorway, and Structure is the archive. */
const RECENT = 5

/** Not a document browser: everything else is one link away in Structure. */
export function Lobby() {
  const kinds = useWritingKinds()

  useEffect(cameFromLobby, [])

  return (
    <Column as="main">
      {kinds.length === 0 ? (
        <>
          <header className={styles.header}>
            <Greeting />
          </header>
          <p className={styles.quiet}>None of the Writing Room’s document types are in this Studio’s schema.</p>
        </>
      ) : (
        <Suspense fallback={<DeskPlaceholder />}>
          <Desk kinds={kinds} />
        </Suspense>
      )}
    </Column>
  )
}

function partOfDay(hour: number) {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

/** A quiet hello: the page belongs to the writing on it, not to the greeting. */
function Greeting() {
  const user = useCurrentUser()
  const firstName = user?.name?.split(' ')[0]
  const greeting = partOfDay(new Date().getHours())
  return <p className={styles.greeting}>{firstName ? `${greeting}, ${firstName}` : greeting}</p>
}

/** Starts a document and opens it. With several kinds of writing, asks which first. */
function StartNew({
  kinds,
  onProblem,
  prominent = false,
}: {
  kinds: WritingKind[]
  onProblem: (problem: string | null) => void
  prominent?: boolean
}) {
  const scheme = useColorSchemeValue()
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const [starting, setStarting] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const only = kinds.length === 1 ? kinds[0]! : null

  useEffect(() => {
    if (!anchor) return undefined
    const close = (event: PointerEvent) => {
      const target = event.target as Node
      if (!menu.current?.contains(target) && !button.current?.contains(target)) setAnchor(null)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [anchor])

  const label = only ? `New ${only.singular}` : 'New'

  return (
    <>
      {only ? (
        <StartKind kind={only} onStarting={setStarting} onProblem={onProblem}>
          {(start) => (
            <button className={styles.startButton} data-prominent={prominent || undefined} ref={button} type="button" onClick={start} disabled={starting} aria-busy={starting}>
              <AddIcon aria-hidden />
              {starting ? 'Starting…' : prominent ? `Start your first ${only.singular}` : label}
            </button>
          )}
        </StartKind>
      ) : (
        <button className={styles.startButton} data-prominent={prominent || undefined}
          ref={button}
          type="button"
          disabled={starting}
          aria-busy={starting}
          aria-haspopup="menu"
          aria-expanded={!!anchor}
          onClick={(event) => setAnchor(anchor ? null : event.currentTarget.getBoundingClientRect())}
        >
          <AddIcon aria-hidden />
          {starting ? 'Starting…' : prominent ? 'Start writing' : label}
        </button>
      )}
      {anchor && (
        <Floating
          anchor={anchor}
          placement="below"
          scheme={scheme}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              setAnchor(null)
              button.current?.focus()
            }
          }}
        >
          <FloatingSurface className={styles.kindMenu} ref={menu} role="menu" aria-label="New">
            {kinds.map((kind) => (
              <StartKind
                key={kind.type}
                kind={kind}
                onStarting={(busy) => {
                  setStarting(busy)
                  if (busy) setAnchor(null)
                }}
                onProblem={onProblem}
              >
                {(start) => (
                  <button className={styles.kindOption} type="button" role="menuitem" onClick={start}>
                    {kind.singular}
                  </button>
                )}
              </StartKind>
            ))}
          </FloatingSurface>
        </Floating>
      )}
    </>
  )
}

/** Creates one kind of document (the SDK's hook is per type) and opens it in the room. */
function StartKind({
  kind,
  onStarting,
  onProblem,
  children,
}: {
  kind: WritingKind
  onStarting: (starting: boolean) => void
  onProblem: (problem: string | null) => void
  children: (start: () => void) => React.ReactNode
}) {
  const router = useRouter()
  const types = useWritingTypes()
  const create = useCreateDocument({documentType: kind.type})
  const busy = useRef(false)

  async function start() {
    if (busy.current) return
    busy.current = true
    onStarting(true)
    onProblem(null)
    try {
      const created = await create()
      router.navigate(roomState(created.documentId, kind.type, types))
    } catch {
      onProblem(`A new ${kind.singular} couldn’t be started just now. Try again in a moment.`)
    } finally {
      busy.current = false
      onStarting(false)
    }
  }

  return <>{children(() => void start())}</>
}

/** What's on the Writer's desk: the one to continue, a few more, and the way to everything else. */
function Desk({kinds}: {kinds: WritingKind[]}) {
  const projectId = useProjectId()
  const dataset = useDataset()
  const types = useMemo(() => kinds.map((kind) => kind.type), [kinds])
  const {data} = useDocuments({
    documentType: types,
    // One spare, for when the document to continue isn't among the most recent.
    batchSize: RECENT + 1,
    orderings: [{field: '_updatedAt', direction: 'desc'}],
  })
  const [remembered, setRemembered] = useState(() => {
    const last = readLastOpened(projectId, dataset)
    return last && types.includes(last.documentType) ? last : null
  })
  const [problem, setProblem] = useState<string | null>(null)

  if (data.length === 0 && !remembered) {
    const names = listOfKinds.format(kinds.map((kind) => kind.singular))
    return (
      <>
        <header className={styles.header}>
          <Greeting />
        </header>
        <div className={styles.blank}>
          <h1 className={styles.blankTitle}>Nothing written yet</h1>
          <p className={styles.quiet}>Your first {names} starts with a title.</p>
          {problem && <p className={styles.blankProblem} role="alert">{problem}</p>}
          <StartNew kinds={kinds} onProblem={setProblem} prominent />
        </div>
      </>
    )
  }

  const first: DocumentHandle = remembered ?? data[0]!
  const others = data.filter((handle) => handle.documentId !== first.documentId).slice(0, RECENT)

  return (
    <>
      <header className={styles.header}>
        <Greeting />
        <StartNew kinds={kinds} onProblem={setProblem} />
      </header>
      {problem && <p className={styles.problem} role="alert">{problem}</p>}
      <section aria-labelledby="calm-continue">
        <SectionLabel id="calm-continue">Continue writing</SectionLabel>
        <Suspense fallback={<Placeholder height="11rem" />}>
          <Continue
            key={first.documentId}
            handle={first}
            kinds={kinds}
            onGone={() => {
              forgetLastOpened(projectId, dataset)
              setRemembered(null)
            }}
          />
        </Suspense>
      </section>
      {others.length > 0 && (
        <section className={styles.recent} aria-labelledby="calm-recent">
          <SectionLabel id="calm-recent">Recent</SectionLabel>
          <ul className={styles.rows}>
            {others.map((handle) => (
              <li key={handle.documentId}>
                <Suspense fallback={<Placeholder height="3.75rem" />}>
                  <Row handle={handle} kinds={kinds} />
                </Suspense>
              </li>
            ))}
          </ul>
        </section>
      )}
      <BrowseLink />
    </>
  )
}

function DeskPlaceholder() {
  return (
    <>
      <header className={styles.header}>
        <Greeting />
      </header>
      <Placeholder height="11rem" aria-hidden />
    </>
  )
}

/** "Post", "Post or Case Study", "Post, Note, or Case Study". */
const listOfKinds = new Intl.ListFormat('en', {type: 'disjunction'})

interface Glimpse {
  title?: string
  text?: string
  _status?: DocumentEditStatus
}

/** A document's title and its words as plain text, wherever its type keeps them. */
function useGlimpse(handle: DocumentHandle, kinds: WritingKind[], ref?: React.RefObject<HTMLElement | null>) {
  const kind = kinds.find((option) => option.type === handle.documentType)
  const {data} = useDocumentProjection<Glimpse>({
    ...handle,
    // With a ref the SDK waits until the row is on screen; without one it loads straight away.
    ...(ref && {ref}),
    projection: `{"title": ${kind?.fields.title ?? 'title'}, "text": pt::text(${kind?.fields.body ?? 'body'})}`,
  })
  const status = describePostStatus(data?._status)
  const known = useSchedule(handle.documentId)
  return {data, kind, status, schedule: known ?? NOT_SCHEDULED, scheduleKnown: known !== null}
}

const STATUS: Record<PostStatus['label'], string> = {
  Draft: 'Draft',
  Published: 'Published',
  'Published · unpublished changes': 'Unpublished changes',
}

/** "Draft", with a dot while there's something readers haven't seen. */
function Status({status, schedule}: {status: PostStatus; schedule: Schedule}) {
  return (
    <span>
      <span className={styles.statusText}>
        {(status.label !== 'Published' || schedule.kind !== 'none') && <span className={styles.dot} aria-hidden />}
        {schedule.kind === 'none' ? STATUS[status.label] : statusText(status, schedule, {short: true})}
      </span>
    </span>
  )
}

/** The one large thing in the Lobby: the document to pick back up, with enough of it to recognise. */
function Continue({
  handle,
  kinds,
  onGone,
}: {
  handle: DocumentHandle
  kinds: WritingKind[]
  onGone: () => void
}) {
  const types = useWritingTypes()
  const {data, kind, status, schedule} = useGlimpse(handle, kinds)
  // The remembered document may have been deleted, or discarded when it was left empty.
  const gone = !status.lastEditedAt
  useEffect(() => {
    if (gone) onGone()
  }, [gone, onGone])

  const text = data?.text?.trim() ?? ''
  const words = countWords(text)

  return (
    <div>
      <StateLink className={styles.continueLink} state={roomState(handle.documentId, handle.documentType, types)}>
        <span className={styles.continueTitle}>{data?.title || 'Untitled'}</span>
        <span className={styles.excerpt}>{text || 'Nothing written yet.'}</span>
        <span className={styles.continueFoot}>
          <span className={styles.meta}>
            {kinds.length > 1 && kind && <span>{kind.singular}</span>}
            <Status status={status} schedule={schedule} />
            {words > 0 && (
              <span>
                {words.toLocaleString()} {words === 1 ? 'word' : 'words'}
              </span>
            )}
            {status.lastEditedAt && <span>Edited {timeAgo(status.lastEditedAt)}</span>}
          </span>
          <span className={styles.go} aria-hidden>
            {schedule.kind === 'none' ? 'Continue' : 'Open'}
            <ArrowRightIcon />
          </span>
        </span>
      </StateLink>
    </div>
  )
}

function Row({handle, kinds}: {handle: DocumentHandle; kinds: WritingKind[]}) {
  const ref = useRef<HTMLDivElement>(null)
  const types = useWritingTypes()
  const {data, kind, status, schedule, scheduleKnown} = useGlimpse(handle, kinds, ref)
  // Only a never-published document with no title and no words can be an abandoned start.
  const maybeEmpty =
    status.label === 'Draft' && scheduleKnown && schedule.kind === 'none' && !data?.title?.trim() && !data?.text?.trim()

  return (
    <div className={styles.row} ref={ref}>
      <StateLink className={styles.rowLink} state={roomState(handle.documentId, handle.documentType, types)}>
        <span className={styles.rowTitle} data-untitled={!data?.title || undefined}>{data?.title || 'Untitled'}</span>
        <span className={styles.meta}>
          {kinds.length > 1 && kind && <span>{kind.singular}</span>}
          <Status status={status} schedule={schedule} />
          {status.lastEditedAt && <span>{timeAgo(status.lastEditedAt)}</span>}
        </span>
      </StateLink>
      {maybeEmpty && kind && (
        <Suspense fallback={null}>
          <DiscardEmpty handle={handle} kind={kind} />
        </Suspense>
      )}
    </div>
  )
}

/**
 * Clears away a start that was never written in. Offered only when the whole document is empty
 * (Details too), the same test the room uses when it discards one on Leave, so there's nothing
 * to lose and nothing to confirm.
 */
function DiscardEmpty({handle, kind}: {handle: DocumentHandle; kind: WritingKind}) {
  const {data: post} = useDocument<Record<string, unknown>>(handle)
  const apply = useApplyDocumentActions()
  if (!isEmptyPost(post, kind.fields)) return null
  return (
    <QuietButton
      title={`Discard this empty ${kind.singular}`}
      onClick={() => void apply(discardDocument(handle))}
    >
      Discard
    </QuietButton>
  )
}

/** The one way to everything else: Structure has the search, the filters and the full list. */
function BrowseLink() {
  const toStudio = useLeaveToStudio()
  return (
    <p className={styles.browse}>
      <QuietButton onClick={toStudio}>
        Browse everything in Structure
        <ArrowRightIcon aria-hidden />
      </QuietButton>
    </p>
  )
}

