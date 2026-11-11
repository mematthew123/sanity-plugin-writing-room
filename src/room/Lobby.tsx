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
import styled from 'styled-components'
import {cameFromLobby} from './came-from'
import {Floating, FloatingSurface} from './editor/floating'
import {isEmptyPost} from './empty-post'
import {useWritingKinds, useWritingTypes, type WritingKind} from './kinds'
import {forgetLastOpened, readLastOpened} from './last-opened'
import {useLeaveToStudio} from './navigation'
import {describePostStatus, type DocumentEditStatus, type PostStatus, timeAgo} from './post-status'
import {Column, NARROW, Placeholder, QuietButton, SectionLabel} from './primitives'
import {roomState} from './room-route'
import {countWords} from './word-count'

/** One to continue, and a few more: the Lobby is a doorway, and Structure is the archive. */
const RECENT = 5

/**
 * The entrance to the Writing Room: pick up where you left off, or start something new. It isn't
 * a document browser; for everything else there's one link to Structure, and the Studio's own
 * navbar stays above it.
 */
export function Lobby() {
  const kinds = useWritingKinds()

  useEffect(cameFromLobby, [])

  return (
    <Column as="main">
      {kinds.length === 0 ? (
        <>
          <Header>
            <Greeting />
          </Header>
          <Quiet>None of the Writing Room’s document types are in this Studio’s schema.</Quiet>
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
  return <GreetingText>{firstName ? `${greeting}, ${firstName}` : greeting}</GreetingText>
}

const Header = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--calm-space-md);
  min-height: 2.5rem;
  margin-bottom: var(--calm-space-xl);
`

const GreetingText = styled.p`
  margin: 0;
  color: var(--calm-color-ink-muted);
  font-family: var(--calm-font-prose);
  font-size: var(--calm-prose-size-medium);
`

const Quiet = styled.p`
  margin: 0;
  color: var(--calm-color-ink-muted);
`

const Problem = styled.p`
  margin: calc(var(--calm-space-lg) * -1) 0 var(--calm-space-lg);
  color: var(--calm-color-caution);
`

const BlankProblem = styled(Problem)`
  margin: 0;
`

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
  const Button = prominent ? StartFirst : StartButton

  return (
    <>
      {only ? (
        <StartKind kind={only} onStarting={setStarting} onProblem={onProblem}>
          {(start) => (
            <Button ref={button} type="button" onClick={start} disabled={starting} aria-busy={starting}>
              <AddIcon aria-hidden />
              {starting ? 'Starting…' : prominent ? `Start your first ${only.singular}` : label}
            </Button>
          )}
        </StartKind>
      ) : (
        <Button
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
        </Button>
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
          <KindMenu ref={menu} role="menu" aria-label="New">
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
                  <KindOption type="button" role="menuitem" onClick={start}>
                    {kind.singular}
                  </KindOption>
                )}
              </StartKind>
            ))}
          </KindMenu>
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

const StartButton = styled.button`
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: var(--calm-space-xs);
  min-height: 2.5rem;
  padding: var(--calm-space-sm) var(--calm-space-md) var(--calm-space-sm) 0.75rem;
  border: 0;
  border-radius: var(--calm-radius-pill);
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--calm-color-rule);
  color: var(--calm-color-ink);
  font: inherit;
  font-weight: var(--calm-weight-ui-strong);
  cursor: pointer;
  transition: background-color var(--calm-motion-gentle) var(--calm-motion-easing);

  &:hover:not(:disabled) {
    background: var(--calm-color-surface);
  }

  &:disabled {
    color: var(--calm-color-ink-muted);
    cursor: default;
  }

  &:focus-visible {
    outline: 2px solid var(--calm-color-accent);
    outline-offset: 2px;
  }

  svg {
    flex-shrink: 0;
    color: var(--calm-color-accent);
    font-size: 1.25rem;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`

/** The same button when it's the only thing to do: nothing has been written yet. */
const StartFirst = styled(StartButton)`
  background: var(--calm-color-accent);
  box-shadow: none;
  color: var(--calm-color-on-accent);

  &:hover:not(:disabled) {
    background: var(--calm-color-accent);
    opacity: 0.9;
  }

  &:disabled {
    color: var(--calm-color-on-accent);
    opacity: 0.7;
  }

  svg {
    color: inherit;
  }
`

const KindMenu = styled(FloatingSurface)`
  display: grid;
  min-width: 11rem;
`

const KindOption = styled.button`
  padding: var(--calm-space-sm) var(--calm-space-md);
  border: 0;
  border-radius: var(--calm-radius);
  background: transparent;
  color: var(--calm-color-ink);
  font: inherit;
  text-align: start;
  cursor: pointer;

  &:hover,
  &:focus-visible {
    background: var(--calm-color-paper);
    outline: none;
  }
`

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
        <Header>
          <Greeting />
        </Header>
        <Blank>
          <BlankTitle>Nothing written yet</BlankTitle>
          <Quiet>Your first {names} starts with a title.</Quiet>
          {problem && <BlankProblem role="alert">{problem}</BlankProblem>}
          <StartNew kinds={kinds} onProblem={setProblem} prominent />
        </Blank>
      </>
    )
  }

  const first: DocumentHandle = remembered ?? data[0]!
  const others = data.filter((handle) => handle.documentId !== first.documentId).slice(0, RECENT)

  return (
    <>
      <Header>
        <Greeting />
        <StartNew kinds={kinds} onProblem={setProblem} />
      </Header>
      {problem && <Problem role="alert">{problem}</Problem>}
      <section aria-labelledby="calm-continue">
        <SectionLabel id="calm-continue">Continue writing</SectionLabel>
        <Suspense fallback={<Placeholder $height="11rem" />}>
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
        <Recent aria-labelledby="calm-recent">
          <SectionLabel id="calm-recent">Recent</SectionLabel>
          <Rows>
            {others.map((handle) => (
              <li key={handle.documentId}>
                <Suspense fallback={<Placeholder $height="3.75rem" />}>
                  <Row handle={handle} kinds={kinds} />
                </Suspense>
              </li>
            ))}
          </Rows>
        </Recent>
      )}
      <BrowseLink />
    </>
  )
}

function DeskPlaceholder() {
  return (
    <>
      <Header>
        <Greeting />
      </Header>
      <Placeholder $height="11rem" aria-hidden />
    </>
  )
}

/** "Post", "Post or Case Study", "Post, Note, or Case Study". */
const listOfKinds = new Intl.ListFormat('en', {type: 'disjunction'})

const Blank = styled.div`
  display: grid;
  justify-items: start;
  gap: var(--calm-space-sm);
  padding: var(--calm-space-xl);
  border-radius: var(--calm-radius-large);
  background: var(--calm-color-surface);

  button {
    margin-top: var(--calm-space-md);
  }
`

const BlankTitle = styled.h1`
  margin: 0;
  font-family: var(--calm-font-prose);
  font-size: calc(var(--calm-prose-size-medium) * 1.5);
  font-weight: var(--calm-weight-title);
  line-height: var(--calm-type-heading-leading);
`

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
  return {data, kind, status: describePostStatus(data?._status)}
}

const STATUS: Record<PostStatus['label'], string> = {
  Draft: 'Draft',
  Published: 'Published',
  'Published · unpublished changes': 'Unpublished changes',
}

/** "Draft", with a dot while there's something readers haven't seen. */
function Status({status}: {status: PostStatus}) {
  return (
    <span>
      <StatusText>
        {status.label !== 'Published' && <Dot aria-hidden />}
        {STATUS[status.label]}
      </StatusText>
    </span>
  )
}

const StatusText = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.4em;
`

const Dot = styled.span`
  width: 0.45em;
  height: 0.45em;
  border-radius: 50%;
  background: var(--calm-color-accent);
`

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
  const {data, kind, status} = useGlimpse(handle, kinds)
  // The remembered document may have been deleted, or discarded when it was left empty.
  const gone = !status.lastEditedAt
  useEffect(() => {
    if (gone) onGone()
  }, [gone, onGone])

  const text = data?.text?.trim() ?? ''
  const words = countWords(text)

  return (
    <div>
      <ContinueLink state={roomState(handle.documentId, handle.documentType, types)}>
        <ContinueTitle>{data?.title || 'Untitled'}</ContinueTitle>
        <Excerpt>{text || 'Nothing written yet.'}</Excerpt>
        <ContinueFoot>
          <Meta>
            {kinds.length > 1 && kind && <span>{kind.singular}</span>}
            <Status status={status} />
            {words > 0 && (
              <span>
                {words.toLocaleString()} {words === 1 ? 'word' : 'words'}
              </span>
            )}
            {status.lastEditedAt && <span>Edited {timeAgo(status.lastEditedAt)}</span>}
          </Meta>
          <Go aria-hidden>
            Continue
            <ArrowRightIcon />
          </Go>
        </ContinueFoot>
      </ContinueLink>
    </div>
  )
}

const ContinueLink = styled(StateLink)`
  display: block;
  padding: var(--calm-space-lg) var(--calm-space-lg) var(--calm-space-md);
  border-radius: var(--calm-radius-large);
  background: var(--calm-color-surface);
  color: inherit;
  text-decoration: none;
  transition: box-shadow var(--calm-motion-gentle) var(--calm-motion-easing);

  &:hover {
    box-shadow: inset 0 0 0 1px var(--calm-color-rule);
  }

  &:focus-visible {
    outline: 2px solid var(--calm-color-accent);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`

const ContinueTitle = styled.span`
  display: block;
  font-family: var(--calm-font-prose);
  font-size: calc(var(--calm-prose-size-medium) * 1.6);
  font-weight: var(--calm-weight-title);
  line-height: var(--calm-type-heading-leading);
  text-wrap: balance;
`

const Excerpt = styled.span`
  display: -webkit-box;
  margin-top: var(--calm-space-sm);
  overflow: hidden;
  color: var(--calm-color-ink-muted);
  font-family: var(--calm-font-prose);
  font-size: var(--calm-prose-size-small);
  line-height: 1.55;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
`

const ContinueFoot = styled.span`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--calm-space-sm) var(--calm-space-md);
  margin-top: var(--calm-space-md);
`

/** Facts about a document, separated by middle dots. */
const Meta = styled.span`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  color: var(--calm-color-ink-muted);
  font-size: var(--calm-type-ui-size-small);

  & > * + *::before {
    content: '·';
    margin-inline: 0.5em;
  }
`

const Go = styled.span`
  display: inline-flex;
  align-items: center;
  gap: var(--calm-space-xs);
  min-height: 2.25rem;
  color: var(--calm-color-accent);
  font-weight: var(--calm-weight-ui-strong);

  svg {
    font-size: 1.25rem;
  }
`

const Recent = styled.section`
  margin-top: var(--calm-space-xl);
`

const Rows = styled.ul`
  display: grid;
  margin: 0 calc(var(--calm-space-md) * -1);
  padding: 0;
  list-style: none;

  ${NARROW} {
    margin-inline: calc(var(--calm-space-sm) * -1);
  }
`

function Row({handle, kinds}: {handle: DocumentHandle; kinds: WritingKind[]}) {
  const ref = useRef<HTMLDivElement>(null)
  const types = useWritingTypes()
  const {data, kind, status} = useGlimpse(handle, kinds, ref)
  // Only a never-published document with no title and no words can be an abandoned start.
  const maybeEmpty = status.label === 'Draft' && !data?.title?.trim() && !data?.text?.trim()

  return (
    <RowRoot ref={ref}>
      <RowLink state={roomState(handle.documentId, handle.documentType, types)}>
        <RowTitle $untitled={!data?.title}>{data?.title || 'Untitled'}</RowTitle>
        <Meta>
          {kinds.length > 1 && kind && <span>{kind.singular}</span>}
          <Status status={status} />
          {status.lastEditedAt && <span>{timeAgo(status.lastEditedAt)}</span>}
        </Meta>
      </RowLink>
      {maybeEmpty && kind && (
        <Suspense fallback={null}>
          <DiscardEmpty handle={handle} kind={kind} />
        </Suspense>
      )}
    </RowRoot>
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

const RowRoot = styled.div`
  display: flex;
  align-items: center;
  gap: var(--calm-space-sm);
  border-radius: var(--calm-radius-large);
  transition: background-color var(--calm-motion-gentle) var(--calm-motion-easing);

  &:hover {
    background: var(--calm-color-surface);
  }

  & > button {
    flex-shrink: 0;
    margin-inline-end: var(--calm-space-sm);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`

const RowLink = styled(StateLink)`
  display: block;
  flex: 1;
  min-width: 0;
  padding: 0.75rem var(--calm-space-md);
  border-radius: var(--calm-radius-large);
  color: inherit;
  text-decoration: none;

  &:focus-visible {
    outline: 2px solid var(--calm-color-accent);
    outline-offset: 2px;
  }

  ${NARROW} {
    padding-inline: var(--calm-space-sm);
  }
`

const RowTitle = styled.span<{$untitled: boolean}>`
  display: block;
  margin-bottom: 2px;
  overflow: hidden;
  color: ${({$untitled}) => ($untitled ? 'var(--calm-color-ink-muted)' : 'inherit')};
  font-family: var(--calm-font-prose);
  font-size: var(--calm-prose-size-medium);
  font-weight: var(--calm-weight-title);
  line-height: var(--calm-type-heading-leading);
  text-overflow: ellipsis;
  white-space: nowrap;
`

/** The one way to everything else: Structure has the search, the filters and the full list. */
function BrowseLink() {
  const toStudio = useLeaveToStudio()
  return (
    <Browse>
      <QuietButton onClick={toStudio}>
        Browse everything in Structure
        <ArrowRightIcon aria-hidden />
      </QuietButton>
    </Browse>
  )
}

const Browse = styled.p`
  margin: var(--calm-space-lg) 0 0 calc(0.75rem * -1);
`
