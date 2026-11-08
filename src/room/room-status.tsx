import {useEditor} from '@portabletext/editor'
import {MoonIcon} from '@sanity/icons/Moon'
import {SunIcon} from '@sanity/icons/Sun'
import {
  type DocumentHandle,
  editDocument,
  publishDocument,
  useApplyDocumentActions,
  useDocument,
  useDocumentSyncStatus,
  usePresenceForDocument,
} from '@sanity/sdk-react'
import {useEffect, useRef, useState, useSyncExternalStore} from 'react'
import {
  useClient,
  useColorSchemeSetValue,
  useColorSchemeValue,
  useCurrentUser,
  useValidationStatus,
} from 'sanity'
import styled from 'styled-components'
import {API_VERSION} from '../lib/api-version'
import {detailsForPublish, type PublishablePost} from '../lib/publish-details'
import {slugTakenByAnotherPost} from '../lib/slug-availability'
import {goToProblem} from './go-to-problem'
import {useOpenDetails} from './navigation'
import {type PostStatus} from './post-status'
import {presenceSentence} from './presence'
import {QuietButton} from './primitives'
import {type Marker, publishProblems} from './publish-problems'

/** A message in the Room Controls, optionally with one gentle next step. */
export interface RoomNotice {
  text: string
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

/**
 * Whether the Writer's words have reached the Content Lake. Normally a small "Saved" that
 * fades; offline it switches to caution and stays until the connection returns.
 */
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

  if (!online) {
    return (
      <Caution role="status">
        {isSynced
          ? 'Offline — changes will sync when you’re back'
          : 'Offline — your words are safe here and will sync when you’re back'}
      </Caution>
    )
  }
  return (
    <Quiet role="status" aria-live="polite">
      {shown === 'saving' ? 'Saving…' : shown === 'saved' ? 'Saved' : ''}
    </Quiet>
  )
}

/** "Draft", "Published", or "Published · unpublished changes". */
export function StatusLabel({status}: {status: PostStatus}) {
  return <Quiet>{status.label}</Quiet>
}

/** "Sam is here too". Never recedes: writing alongside someone without knowing is unsettling. */
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

/** Switches the whole Studio between light and dark; the navbar's own toggle is hidden in here. */
export function ThemeToggle() {
  const scheme = useColorSchemeValue()
  const setScheme = useColorSchemeSetValue()
  if (!setScheme) return null
  const next = scheme === 'dark' ? 'light' : 'dark'
  return (
    <QuietButton
      icon={scheme === 'dark' ? SunIcon : MoonIcon}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      onClick={() => setScheme(next)}
    />
  )
}

interface PostForPublish extends PublishablePost {
  coverImage?: {asset?: unknown}
}

const SETTLE_TIMEOUT_MS = 4000

/**
 * Publish, from inside the room. Waits for the Writer's latest words to sync and validate (and
 * gives up with a gentle retry if that takes too long); if something blocks the publish, takes
 * them straight to it instead of listing errors.
 */
export function PublishButton({
  handle,
  status,
  onProblem,
  onNotice,
}: {
  handle: DocumentHandle
  status: PostStatus
  onProblem: (problem: string | null) => void
  onNotice: (notice: RoomNotice) => void
}) {
  const editor = useEditor()
  const client = useClient({apiVersion: API_VERSION})
  const apply = useApplyDocumentActions()
  const {data: post} = useDocument<PostForPublish>(handle)
  const isSynced = useDocumentSyncStatus(handle) ?? true
  const validation = useValidationStatus(`drafts.${handle.documentId}`, 'post')
  const openDetails = useOpenDetails(handle.documentId)
  const [phase, setPhase] = useState<'idle' | 'checking' | 'publishing'>('idle')
  const [timedOut, setTimedOut] = useState(false)
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

    const problems = publishProblems(validation.validation as Marker[])
    const [first, ...rest] = problems
    if (first) {
      setPhase('idle')
      onProblem(rest.length > 0 ? `${first.message} (and ${rest.length} more)` : first.message)
      goToProblem(first.target, editor, openDetails)
      return
    }

    setPhase('publishing')
    void (async () => {
      try {
        const details = await detailsForPublish({
          post: post ?? {},
          isFirstPublish,
          isTaken: slugTakenByAnotherPost(client, handle.documentId),
        })
        const edit = Object.keys(details).length > 0 ? [editDocument(handle, {set: {...details}})] : []
        await apply([...edit, publishDocument(handle)])
        onProblem(null)
        onNotice(
          post?.coverImage?.asset
            ? {text: 'Published'}
            : {text: 'Published', action: {label: 'Add a cover image', onClick: openDetails}},
        )
      } catch {
        onProblem('This Post couldn’t be published just now. Try again in a moment.')
      } finally {
        setPhase('idle')
      }
    })()
  }, [
    phase,
    timedOut,
    isSynced,
    validation,
    post,
    isFirstPublish,
    client,
    handle,
    apply,
    editor,
    openDetails,
    onProblem,
    onNotice,
  ])

  if (status.label === 'Published' && phase === 'idle') return null

  return (
    <PublishPill
      type="button"
      disabled={phase !== 'idle'}
      onClick={() => {
        setTimedOut(false)
        setPhase('checking')
      }}
    >
      {phase === 'idle' ? (isFirstPublish ? 'Publish' : 'Publish changes') : 'Publishing…'}
    </PublishPill>
  )
}

const Quiet = styled.span`
  color: var(--calm-color-ink-muted);
  font-size: var(--calm-type-ui-size-small);
  white-space: nowrap;
`

const Caution = styled.span`
  color: var(--calm-color-caution);
  font-size: var(--calm-type-ui-size-small);
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

  &:focus-visible {
    outline: 2px solid var(--calm-color-accent);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`
