import {useEditor} from '@portabletext/editor'
import {CheckmarkCircleIcon} from '@sanity/icons/CheckmarkCircle'
import {CloseIcon} from '@sanity/icons/Close'
import {
  type DocumentHandle,
  editDocument,
  publishDocument,
  useApplyDocumentActions,
  useDocument,
  useDocumentSyncStatus,
  usePresenceForDocument,
} from '@sanity/sdk-react'
import {useCallback, useEffect, useRef, useState, useSyncExternalStore} from 'react'
import {
  useClient,
  useCurrentUser,
  useValidationStatus,
} from 'sanity'
import styled, {keyframes} from 'styled-components'
import {useWritingRoomConfig} from '../config'
import {API_VERSION} from '../lib/api-version'
import {detailsForPublish, type PublishDetails} from '../lib/publish-details'
import {slugTakenByAnother} from '../lib/slug-availability'
import {addImageLabel, detailsPatch, readPublishable} from './fields'
import {goToProblem} from './go-to-problem'
import {Floating, FloatingSurface, useViewportChanges} from './editor/floating'
import {useWritingKind} from './kinds'
import {useOpenDetails} from './navigation'
import {type PostStatus} from './post-status'
import {presenceSentence} from './presence'
import {NARROW, QuietButton} from './primitives'
import {type Marker, publishProblems} from './publish-problems'

export interface RoomNotice {
  text: string
  /** Something went well (a publish): shown with a tick. */
  done?: boolean
  /** Somewhere to go next, in a new tab: the published page. */
  link?: {label: string; href: string}
  action?: {label: string; onClick: () => void}
}

function subscribeOnline(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

const useOnline = () => useSyncExternalStore(subscribeOnline, () => navigator.onLine)

const SAVED_VISIBLE_MS = 2000
const SAVING_DELAY_MS = 800

/** Offline, it stays until the connection returns. */
export function SaveState({handle}: {handle: DocumentHandle}) {
  const isSynced = useDocumentSyncStatus(handle) ?? true
  const online = useOnline()
  const [shown, setShown] = useState<'saving' | 'saved' | null>(null)
  const wasSynced = useRef(isSynced)

  useEffect(() => {
    if (!isSynced) {
      const timer = setTimeout(() => setShown('saving'), SAVING_DELAY_MS)
      wasSynced.current = false
      return () => clearTimeout(timer)
    }
    if (!wasSynced.current) {
      wasSynced.current = true
      setShown('saved')
      const timer = setTimeout(() => setShown(null), SAVED_VISIBLE_MS)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [isSynced])

  if (!online) return <Caution>Offline</Caution>
  return (
    <Quiet role="status" aria-live="polite">
      {shown === 'saving' ? 'Saving…' : shown === 'saved' ? 'Saved' : ''}
    </Quiet>
  )
}

/**
 * The one place the room speaks up, at the foot of the page and clear of the Room Controls: a
 * problem the Writer needs to know about (it stays until dismissed or resolved), being offline,
 * or a passing notice such as "Published".
 */
export function RoomMessage({
  handle,
  problem,
  onDismissProblem,
  notice,
}: {
  handle: DocumentHandle
  problem: string | null
  onDismissProblem: () => void
  notice: RoomNotice | null
}) {
  const online = useOnline()
  const isSynced = useDocumentSyncStatus(handle) ?? true

  if (problem) {
    return (
      <Message role="alert" $caution>
        {problem}
        <QuietButton icon={CloseIcon} aria-label="Dismiss" onClick={onDismissProblem} />
      </Message>
    )
  }
  if (!online) {
    return (
      <Message role="status" $caution>
        {isSynced
          ? 'Offline — changes will sync when you’re back'
          : 'Offline — your words are safe here and will sync when you’re back'}
      </Message>
    )
  }
  if (notice) {
    return (
      <Message role="status">
        {notice.done && <CheckmarkCircleIcon aria-hidden />}
        <strong>{notice.text}</strong>
        {notice.link && (
          <NoticeLink href={notice.link.href} target="_blank" rel="noopener noreferrer">
            {notice.link.label}
          </NoticeLink>
        )}
        {notice.action && <QuietButton onClick={notice.action.onClick}>{notice.action.label}</QuietButton>}
      </Message>
    )
  }
  return null
}

export function StatusLabel({status}: {status: PostStatus}) {
  return <Quiet>{status.label}</Quiet>
}

/** Never recedes: writing alongside someone without knowing is unsettling. */
export function Presence({handle}: {handle: DocumentHandle}) {
  const {presence} = usePresenceForDocument({
    documentId: handle.documentId,
    documentType: handle.documentType,
  })
  const me = useCurrentUser()
  const others = new Map<string, string>()
  for (const participant of presence) {
    const {sanityUserId, profile} = participant.user
    if (sanityUserId !== me?.id) others.set(sanityUserId, profile.displayName)
  }
  const sentence = presenceSentence([...others.values()])
  return sentence ? <Quiet role="status">{sentence}</Quiet> : null
}

const SETTLE_TIMEOUT_MS = 4000

interface PublishPlan {
  details: PublishDetails
  /** Set when the Studio has said where its site is. */
  url: URL | null
  /** Shown instead of `url` when there isn't one. */
  slug: string | undefined
}

/** Waits for the latest words to sync and validate, goes to any problem, then asks once before publishing. */
export function PublishButton({
  handle,
  status,
  scheme,
  onProblem,
  onNotice,
}: {
  handle: DocumentHandle
  status: PostStatus
  scheme: string
  onProblem: (problem: string | null) => void
  onNotice: (notice: RoomNotice) => void
}) {
  const editor = useEditor()
  const client = useClient({apiVersion: API_VERSION})
  const apply = useApplyDocumentActions()
  const {data: post} = useDocument<Record<string, unknown>>(handle)
  const isSynced = useDocumentSyncStatus(handle) ?? true
  const validation = useValidationStatus(`drafts.${handle.documentId}`, handle.documentType)
  const openDetails = useOpenDetails(handle)
  const kind = useWritingKind(handle.documentType)
  const {preview: site} = useWritingRoomConfig()
  const [phase, setPhase] = useState<'idle' | 'checking' | 'preparing' | 'confirming' | 'publishing'>('idle')
  const [timedOut, setTimedOut] = useState(false)
  const [plan, setPlan] = useState<PublishPlan | null>(null)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const confirmButton = useRef<HTMLButtonElement>(null)
  const isFirstPublish = status.label === 'Draft'

  useEffect(() => {
    if (phase !== 'checking') return undefined
    const timer = setTimeout(() => setTimedOut(true), SETTLE_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [phase])

  useEffect(() => {
    if (phase !== 'checking') return
    if (!isSynced || validation.isValidating) {
      // Never publish on stale sync or validation: the SDK's publish doesn't enforce the schema.
      if (timedOut) {
        setPhase('idle')
        onProblem('Still saving your latest changes. Try publishing again in a moment.')
      }
      return
    }

    const problems = publishProblems(validation.validation as Marker[], kind.fields)
    const [first, ...rest] = problems
    if (first) {
      setPhase('idle')
      onProblem(rest.length > 0 ? `${first.message} (and ${rest.length} more)` : first.message)
      goToProblem(first.target, editor, openDetails)
      return
    }

    setPhase('preparing')
    void (async () => {
      try {
        const {fields} = kind
        const publishable = readPublishable(post, fields)
        const details = await detailsForPublish({
          post: publishable,
          isFirstPublish,
          isTaken: slugTakenByAnother(client, handle.documentType, fields.slug, handle.documentId),
        })
        const slug = fields.slug ? (details.slug?.current ?? publishable.slug?.current) : undefined
        setPlan({details, slug, url: site && slug ? liveUrl(site, slug, handle.documentType) : null})
        onProblem(null)
        setPhase('confirming')
      } catch {
        onProblem(`This ${kind.singular} couldn’t be published just now. Try again in a moment.`)
        setPhase('idle')
      }
    })()
  }, [phase, timedOut, isSynced, validation, post, isFirstPublish, client, handle, editor, openDetails, kind, site, onProblem])

  const cancel = useCallback(() => {
    setPhase('idle')
    setPlan(null)
  }, [])

  const confirming = phase === 'confirming' && plan
  const measure = useCallback(() => {
    setAnchor(confirming ? (button.current?.getBoundingClientRect() ?? null) : null)
  }, [confirming])
  useEffect(measure, [measure])
  useViewportChanges(measure)

  // The Writer asked to publish a moment ago, so Enter should finish the thought. Focus moves once
  // the popover has been placed: it's hidden, and can't take focus, until then.
  const open = !!confirming && !!anchor
  useEffect(() => {
    if (!open) return undefined
    const frame = requestAnimationFrame(() => confirmButton.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [open])

  useEffect(() => {
    if (!confirming) return undefined
    const close = (event: PointerEvent) => {
      const target = event.target as Node
      if (!panel.current?.contains(target) && !button.current?.contains(target)) cancel()
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [confirming, cancel])

  async function publish({details, url}: PublishPlan) {
    setPhase('publishing')
    try {
      const {fields} = kind
      // The date is when the Writer said yes, not when the room asked.
      const patch = detailsPatch(
        details.publishedAt ? {...details, publishedAt: new Date().toISOString()} : details,
        fields,
      )
      const edit = Object.keys(patch).length > 0 ? [editDocument(handle, {set: patch})] : []
      await apply([...edit, publishDocument(handle)])
      onProblem(null)
      const image = fields.image ? (post?.[fields.image] as {asset?: unknown} | undefined) : undefined
      onNotice({
        text: isFirstPublish ? 'Published' : 'Changes published',
        done: true,
        link: url ? {label: 'View it live', href: url.href} : undefined,
        action:
          !fields.image || image?.asset
            ? undefined
            : {label: addImageLabel(kind.imageTitle), onClick: openDetails},
      })
    } catch {
      onProblem(`This ${kind.singular} couldn’t be published just now. Try again in a moment.`)
    } finally {
      setPhase('idle')
      setPlan(null)
    }
  }

  if (status.label === 'Published' && phase === 'idle') return null

  const working = phase === 'checking' || phase === 'preparing' || phase === 'publishing'
  const label = isFirstPublish ? 'Publish' : 'Publish changes'

  return (
    <>
      <PublishPill
        ref={button}
        type="button"
        disabled={working}
        aria-haspopup="dialog"
        aria-expanded={!!confirming}
        onClick={() => {
          if (confirming) return cancel()
          setTimedOut(false)
          setPhase('checking')
        }}
      >
        {phase === 'publishing' ? 'Publishing…' : working ? 'Checking…' : label}
      </PublishPill>
      {confirming && anchor && (
        <Floating
          anchor={anchor}
          placement="below"
          scheme={scheme}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              cancel()
              button.current?.focus()
            }
          }}
        >
          <Confirm ref={panel} role="dialog" aria-labelledby="calm-publish-title">
            <ConfirmTitle id="calm-publish-title">
              {isFirstPublish ? `Publish this ${kind.singular}?` : 'Publish these changes?'}
            </ConfirmTitle>
            <ConfirmText>
              {isFirstPublish
                ? 'It goes live straight away'
                : 'They replace what readers see now'}
              {plan.url ? ', at' : plan.slug ? ', under the slug' : '.'}
            </ConfirmText>
            {(plan.url || plan.slug) && (
              <Where>{plan.url ? `${plan.url.host}${plan.url.pathname}` : plan.slug}</Where>
            )}
            <ConfirmActions>
              <QuietButton onClick={cancel}>Not yet</QuietButton>
              <PublishPill ref={confirmButton} type="button" onClick={() => void publish(plan)}>
                {isFirstPublish ? 'Publish now' : 'Publish changes'}
              </PublishPill>
            </ConfirmActions>
          </Confirm>
        </Floating>
      )}
    </>
  )
}

/** Where a document is read on the Studio's site, or null if its settings don't make a URL. */
function liveUrl(
  site: {origin: string; pathname: (slug: string, documentType: string) => string},
  slug: string,
  documentType: string,
): URL | null {
  try {
    return new URL(site.pathname(slug, documentType), site.origin)
  } catch {
    return null
  }
}

const Quiet = styled.span`
  min-width: 0;
  margin-inline: var(--calm-space-sm);
  overflow: hidden;
  color: var(--calm-color-ink-muted);
  font-size: var(--calm-type-ui-size-small);
  text-overflow: ellipsis;
  white-space: nowrap;

  &:empty {
    display: none;
  }
`

const Caution = styled.span`
  flex-shrink: 0;
  margin-inline: var(--calm-space-sm);
  color: var(--calm-color-caution);
  font-size: var(--calm-type-ui-size-small);
  white-space: nowrap;
`

const messageIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(4px);
  }
`

const Message = styled.p<{$caution?: boolean}>`
  display: flex;
  align-items: center;
  gap: var(--calm-space-xs);
  box-sizing: border-box;
  max-width: 100%;
  min-height: 2.5rem;
  margin: 0;
  padding: var(--calm-space-xs) var(--calm-space-md);
  border-radius: var(--calm-radius-large);
  background: var(--calm-color-surface);
  box-shadow: var(--calm-color-floating-shadow);
  color: ${({$caution}) => ($caution ? 'var(--calm-color-caution)' : 'var(--calm-color-ink)')};
  font-size: var(--calm-type-ui-size);
  text-wrap: pretty;

  [data-scheme='dark'] & {
    box-shadow: inset 0 0 0 1px var(--calm-color-rule);
  }

  strong {
    font-weight: var(--calm-weight-ui-strong);
    white-space: nowrap;
  }

  ${NARROW} {
    flex-wrap: wrap;
  }

  & > svg {
    flex-shrink: 0;
    margin-inline-start: calc(var(--calm-space-xs) * -1);
    color: var(--calm-color-accent);
    font-size: 1.5rem;
  }

  button {
    flex-shrink: 0;
    min-height: 1.75rem;
    margin-inline-end: calc(var(--calm-space-sm) * -1);
    padding: var(--calm-space-xs) var(--calm-space-sm);
  }

  @media (prefers-reduced-motion: no-preference) {
    animation: ${messageIn} var(--calm-motion-gentle) var(--calm-motion-easing);
  }
`

const PublishPill = styled.button`
  min-height: 2.25rem;
  padding: var(--calm-space-sm) var(--calm-space-md);
  border: 0;
  border-radius: var(--calm-radius-pill);
  background: var(--calm-color-accent);
  color: var(--calm-color-on-accent);
  font: inherit;
  font-weight: var(--calm-weight-ui-strong);
  cursor: pointer;
  transition: opacity var(--calm-motion-gentle) var(--calm-motion-easing);

  &:hover {
    opacity: 0.9;
  }

  &:disabled {
    cursor: default;
    opacity: 0.7;
  }

  /* While the room asks "Publish this?", the answer is the one clay thing; the question steps back. */
  &[aria-expanded='true'] {
    background: var(--calm-color-surface);
    color: var(--calm-color-ink);
  }

  &:focus-visible {
    outline: 2px solid var(--calm-color-accent);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`

const NoticeLink = styled.a`
  margin-inline-start: var(--calm-space-sm);
  border-radius: var(--calm-radius);
  /* Ink, not clay: the tick beside it is the notice's one accent. */
  color: var(--calm-color-ink);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 0.2em;
  white-space: nowrap;

  &:focus-visible {
    outline: 2px solid var(--calm-color-accent);
    outline-offset: 2px;
  }
`

const Confirm = styled(FloatingSurface)`
  width: min(21rem, calc(100vw - 24px));
  padding: var(--calm-space-lg);
`

const ConfirmTitle = styled.h2`
  margin: 0 0 var(--calm-space-sm);
  font-family: var(--calm-font-prose);
  font-size: 1.375rem;
  font-weight: var(--calm-weight-title);
  line-height: var(--calm-type-heading-leading);
  text-wrap: balance;
`

const ConfirmText = styled.p`
  margin: 0;
  color: var(--calm-color-ink-muted);
`

/** The address, or the slug: the one fact worth a second look before saying yes. */
const Where = styled.p`
  margin: var(--calm-space-xs) 0 0;
  color: var(--calm-color-ink);
  font-weight: var(--calm-weight-ui-strong);
  overflow-wrap: anywhere;
`

const ConfirmActions = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--calm-space-xs);
  margin-top: var(--calm-space-lg);
`
