import {useEditor} from '@portabletext/editor'
import {CheckmarkCircleIcon} from '@sanity/icons/CheckmarkCircle'
import {CloseIcon} from '@sanity/icons/Close'
import {
  type DocumentHandle,
  editDocument,
  publishDocument,
  useApplyDocumentActions,
  useDocumentSyncStatus,
  usePresenceForDocument,
} from '@sanity/sdk-react'
import {createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore} from 'react'
import {
  useClient,
  useCurrentUser,
  useSyncState,
  useValidationStatus,
} from 'sanity'
import {useWritingRoomConfig} from '../config'
import {API_VERSION} from '../lib/api-version'
import {detailsForPublish, type PublishDetails} from '../lib/publish-details'
import {formatGoLive, fromLocalInput, type Schedule, suggestedTime, toLocalInput} from '../lib/schedule'
import {schedulePost, unlockPost} from '../lib/schedule-actions'
import {slugTakenByAnother} from '../lib/slug-availability'
import {addImageLabel, detailsPatch, readPublishable} from './fields'
import {type PublishablePost} from '../lib/publish-details'
import {goToProblem} from './go-to-problem'
import {Floating, FloatingSurface, useViewportChanges} from './editor/floating'
import {useWritingKind} from './kinds'
import {useRoomView} from './navigation'
import {type PostStatus, statusText} from './post-status'
import {presenceSentence} from './presence'
import {QuietButton} from './primitives'
import {type Marker, publishProblems} from './publish-problems'
import styles from './room-status.module.css'

export interface RoomNotice {
  text: string
  /** Something went well (a publish): shown with a tick. */
  done?: boolean
  /** Somewhere to go next, in a new tab: the published page. */
  link?: {label: string; href: string}
  action?: {label: string; onClick: () => void}
  /** More than one thing to do next: "See Details" and "Undo" after Sorting. */
  actions?: Array<{label: string; onClick: () => void}>
  /** Doesn't pass by itself: whoever showed it takes it away. Only for Sorting's hold and its way back. */
  stays?: boolean
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

const RoomSynced = createContext(true)

/**
 * The Prose saves through the App SDK and Details through the Studio's own store, so the room is
 * only saved once both have caught up. Watched once here, for everything in the room that asks.
 */
export function RoomSyncProvider({handle, children}: {handle: DocumentHandle; children: ReactNode}) {
  const proseSynced = useDocumentSyncStatus(handle) ?? true
  const details = useSyncState(handle.documentId, handle.documentType)
  return <RoomSynced.Provider value={proseSynced && !details.isSyncing}>{children}</RoomSynced.Provider>
}

const useRoomSynced = () => useContext(RoomSynced)

/** Offline, it stays until the connection returns. */
export function SaveState() {
  const isSynced = useRoomSynced()
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

  if (!online) return <span className={styles.caution}>Offline</span>
  return (
    <span className={styles.quiet} role="status" aria-live="polite">
      {shown === 'saving' ? 'Saving…' : shown === 'saved' ? 'Saved' : ''}
    </span>
  )
}

/**
 * The one place the room speaks up, at the foot of the page and clear of the Room Controls: a
 * problem the Writer needs to know about (it stays until dismissed or resolved), being offline,
 * or a passing notice such as "Published".
 */
export function RoomMessage({
  problem,
  onDismissProblem,
  notice,
}: {
  problem: string | null
  onDismissProblem: () => void
  notice: RoomNotice | null
}) {
  const online = useOnline()
  const isSynced = useRoomSynced()

  if (problem) {
    return (
      <p className={styles.message} role="alert" data-caution="">
        {problem}
        <QuietButton icon={CloseIcon} aria-label="Dismiss" onClick={onDismissProblem} />
      </p>
    )
  }
  if (!online) {
    return (
      <p className={styles.message} role="status" data-caution="">
        {isSynced
          ? 'Offline — changes will sync when you’re back'
          : 'Offline — your words are safe here and will sync when you’re back'}
      </p>
    )
  }
  if (notice) {
    return (
      <p className={styles.message} role="status">
        {notice.done && <CheckmarkCircleIcon aria-hidden />}
        <strong>{notice.text}</strong>
        {notice.link && (
          <a className={styles.noticeLink} href={notice.link.href} target="_blank" rel="noopener noreferrer">
            {notice.link.label}
          </a>
        )}
        {notice.action && <QuietButton onClick={notice.action.onClick}>{notice.action.label}</QuietButton>}
        {notice.actions?.map((action) => (
          <QuietButton key={action.label} onClick={action.onClick}>
            {action.label}
          </QuietButton>
        ))}
      </p>
    )
  }
  return null
}

export function StatusLabel({status, schedule}: {status: PostStatus; schedule: Schedule}) {
  return <span className={styles.quiet}>{statusText(status, schedule)}</span>
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
  return sentence ? <span className={styles.quiet} role="status">{sentence}</span> : null
}

/** Long enough for a save, a read of the saved draft, and a validation of it. */
const SETTLE_TIMEOUT_MS = 6000

interface PublishPlan {
  details: PublishDetails
  /** Set when the Studio has said where its site is. */
  url: URL | null
  /** Shown instead of `url` when there isn't one. */
  slug: string | undefined
  /** The slug and date the plan was made from. If they've moved by the time the Writer says yes, the plan is off. */
  basis: PublishablePost
}

type SavedDraft = Record<string, unknown> & {_rev?: string}

const VALIDATION_QUIET_MS = 1500

/**
 * Whether `validation` is a verdict on the document as it is now. For a moment after the room
 * opens, and after each edit, it reports no problems and isn't validating yet: that isn't a pass.
 * So it counts once a validation of this revision has been seen to finish, or, for a result that
 * was already there when the room opened, once it has stayed put for a while.
 */
function useValidated({isValidating, revision}: {isValidating: boolean; revision?: string}): boolean {
  const [settled, setSettled] = useState<string | undefined>(undefined)
  const sawValidating = useRef(false)

  useEffect(() => {
    if (isValidating) {
      sawValidating.current = true
      return undefined
    }
    if (!revision) return undefined
    if (sawValidating.current) {
      sawValidating.current = false
      setSettled(revision)
      return undefined
    }
    const timer = setTimeout(() => setSettled(revision), VALIDATION_QUIET_MS)
    return () => clearTimeout(timer)
  }, [isValidating, revision])

  return !isValidating && revision !== undefined && settled === revision
}

function useAskOnce(asking: boolean, cancel: () => void) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const answer = useRef<HTMLButtonElement>(null)

  const measure = useCallback(() => {
    setAnchor(asking ? (button.current?.getBoundingClientRect() ?? null) : null)
  }, [asking])
  useEffect(measure, [measure])
  useViewportChanges(measure)

  // The Writer asked a moment ago, so Enter should finish the thought. Focus moves once
  // the popover has been placed: it's hidden, and can't take focus, until then.
  const open = asking && !!anchor
  useEffect(() => {
    if (!open) return undefined
    const frame = requestAnimationFrame(() => answer.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [open])

  useEffect(() => {
    if (!asking) return undefined
    const close = (event: PointerEvent) => {
      const target = event.target as Node
      if (!panel.current?.contains(target) && !button.current?.contains(target)) cancel()
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [asking, cancel])

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      cancel()
      button.current?.focus()
    },
    [cancel],
  )

  return {anchor: open ? anchor : null, button, panel, answer, onKeyDown}
}

/** Waits for the latest words to sync and validate, goes to any problem, then asks once before publishing. */
export function PublishButton({
  handle,
  status,
  scheme,
  canSchedule,
  previousTime,
  onProblem,
  onNotice,
}: {
  handle: DocumentHandle
  status: PostStatus
  scheme: string
  canSchedule: boolean
  previousTime?: string
  onProblem: (problem: string | null) => void
  onNotice: (notice: RoomNotice) => void
}) {
  const editor = useEditor()
  const client = useClient({apiVersion: API_VERSION})
  const apply = useApplyDocumentActions()
  const isSynced = useRoomSynced()
  const validation = useValidationStatus(`drafts.${handle.documentId}`, handle.documentType)
  const settled = useValidated(validation)
  const [draft, setDraft] = useState<SavedDraft | null>(null)
  const {openDetails} = useRoomView(handle)
  const kind = useWritingKind(handle.documentType)
  const {preview: site} = useWritingRoomConfig()
  const [phase, setPhase] = useState<
    'idle' | 'checking' | 'preparing' | 'confirming' | 'publishing' | 'scheduling'
  >('idle')
  const [timedOut, setTimedOut] = useState(false)
  const [plan, setPlan] = useState<PublishPlan | null>(null)
  const [when, setWhen] = useState<string | null>(null)
  const [whenProblem, setWhenProblem] = useState(false)
  const isFirstPublish = status.label === 'Draft'

  useEffect(() => {
    if (phase !== 'checking') return undefined
    const timer = setTimeout(() => setTimedOut(true), SETTLE_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [phase])

  // The draft as it is saved, read again whenever validation moves on to another revision. Both
  // stores write to it, so only the server knows which revision is the latest.
  useEffect(() => {
    if (phase !== 'checking' || !isSynced) return undefined
    let superseded = false
    client.getDocument<SavedDraft>(`drafts.${handle.documentId}`).then(
      (saved) => {
        if (!superseded) setDraft(saved ?? null)
      },
      () => {
        if (superseded) return
        setPhase('idle')
        onProblem(`This ${kind.singular} couldn’t be published just now. Try again in a moment.`)
      },
    )
    return () => {
      superseded = true
    }
  }, [phase, isSynced, validation.revision, client, handle.documentId, kind.singular, onProblem])

  useEffect(() => {
    if (phase !== 'checking') return
    // Two things make validation a verdict on what would be published. It has settled: `revision`
    // moves on the moment the draft does, before the markers do. And its revision is the saved
    // draft's: the Prose saves through another store, which the Studio's hears of a moment later.
    const validated = settled && !!draft?._rev && validation.revision === draft._rev
    if (!isSynced || !draft || !validated) {
      // Never publish on stale sync or validation: the SDK's publish doesn't enforce the schema.
      if (timedOut) {
        setPhase('idle')
        onProblem(
          isSynced
            ? `Still checking this ${kind.singular}. Try publishing again in a moment.`
            : 'Still saving your latest changes. Try publishing again in a moment.',
        )
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
        const basis = readPublishable(draft, fields)
        const details = await detailsForPublish({
          post: basis,
          isFirstPublish,
          isTaken: slugTakenByAnother(client, handle.documentType, fields.slug, handle.documentId),
        })
        const slug = fields.slug ? (details.slug?.current ?? basis.slug?.current) : undefined
        setPlan({details, slug, basis, url: site && slug ? liveUrl(site, slug, handle.documentType) : null})
        onProblem(null)
        setPhase('confirming')
      } catch {
        onProblem(`This ${kind.singular} couldn’t be published just now. Try again in a moment.`)
        setPhase('idle')
      }
    })()
  }, [phase, timedOut, isSynced, validation, settled, draft, isFirstPublish, client, handle, editor, openDetails, kind, site, onProblem])

  const cancel = useCallback(() => {
    setPhase('idle')
    setPlan(null)
    setWhen(null)
    setWhenProblem(false)
  }, [])

  const confirming = phase === 'confirming' && plan
  const {anchor, button, panel, answer: confirmButton, onKeyDown} = useAskOnce(!!confirming, cancel)

  async function savedIfPlanStands(basis: PublishablePost): Promise<SavedDraft | null | undefined> {
    // The plan's slug and date were settled when the room asked. If someone has changed either
    // since, in Details or from elsewhere, writing the plan now would undo their change.
    const saved = await client.getDocument<SavedDraft>(`drafts.${handle.documentId}`)
    const now = readPublishable(saved, kind.fields)
    if (now.slug?.current !== basis.slug?.current || now.publishedAt !== basis.publishedAt) {
      onProblem(`This ${kind.singular}’s details changed while you were deciding. Publish again to use them.`)
      return null
    }
    return saved
  }

  async function schedule({details, basis}: PublishPlan) {
    const at = fromLocalInput(when ?? '')
    if (!at || at.getTime() <= Date.now()) {
      setWhenProblem(true)
      return
    }
    setPhase('scheduling')
    try {
      const saved = await savedIfPlanStands(basis)
      if (saved === null) return
      // The check was of one revision. Scheduling copies the draft as it is saved, so a later
      // revision, a collaborator's say, would go on the schedule unchecked.
      if (!saved?._rev || saved._rev !== draft?._rev) {
        onProblem(`This ${kind.singular} changed while you were deciding. Publish again to schedule it as it is now.`)
        return
      }
      const patch = detailsPatch(
        details.publishedAt ? {...details, publishedAt: at.toISOString()} : details,
        kind.fields,
      )
      await schedulePost(client, {
        documentId: handle.documentId,
        publishAt: at,
        details: patch,
        revision: saved._rev,
      })
      onProblem(null)
      onNotice({text: `Scheduled for ${formatGoLive(at.toISOString())}`, done: true})
    } catch {
      onProblem(`This ${kind.singular} couldn’t be scheduled just now. Try again in a moment.`)
    } finally {
      cancel()
    }
  }

  async function publish({details, url, basis}: PublishPlan) {
    setPhase('publishing')
    try {
      const {fields} = kind
      const saved = await savedIfPlanStands(basis)
      if (saved === null) return
      // The date is when the Writer said yes, not when the room asked.
      const patch = detailsPatch(
        details.publishedAt ? {...details, publishedAt: new Date().toISOString()} : details,
        fields,
      )
      const edit = Object.keys(patch).length > 0 ? [editDocument(handle, {set: patch})] : []
      await apply([...edit, publishDocument(handle)])
      onProblem(null)
      const image = fields.image ? (saved?.[fields.image] as {asset?: unknown} | undefined) : undefined
      onNotice({
        text: isFirstPublish ? 'Published' : 'Changes published',
        done: true,
        link: url ? {label: 'View it live', href: url.href} : undefined,
        action:
          !fields.image || image?.asset
            ? undefined
            : {label: addImageLabel(kind.imageTitle), onClick: () => openDetails(fields.image)},
      })
    } catch {
      onProblem(`This ${kind.singular} couldn’t be published just now. Try again in a moment.`)
    } finally {
      cancel()
    }
  }

  if (status.label === 'Published' && phase === 'idle') return null

  const working =
    phase === 'checking' || phase === 'preparing' || phase === 'publishing' || phase === 'scheduling'
  const label = isFirstPublish ? 'Publish' : 'Publish changes'

  return (
    <>
      <button
        className={styles.publishPill}
        ref={button}
        type="button"
        disabled={working}
        aria-haspopup="dialog"
        aria-expanded={!!confirming}
        onClick={() => {
          if (confirming) return cancel()
          setTimedOut(false)
          setDraft(null)
          setPhase('checking')
        }}
      >
        {phase === 'publishing'
          ? 'Publishing…'
          : phase === 'scheduling'
            ? 'Scheduling…'
            : working
              ? 'Checking…'
              : label}
      </button>
      {confirming && anchor && (
        <Floating anchor={anchor} placement="below" scheme={scheme} onKeyDown={onKeyDown}>
          <FloatingSurface className={styles.confirm} ref={panel} role="dialog" aria-labelledby="calm-publish-title">
            {when === null ? (
              <>
                <h2 className={styles.confirmTitle} id="calm-publish-title">
                  {isFirstPublish ? `Publish this ${kind.singular}?` : 'Publish these changes?'}
                </h2>
                <p className={styles.confirmText}>
                  {isFirstPublish ? 'It goes live straight away' : 'They replace what readers see now'}
                  {plan.url ? ', at' : plan.slug ? ', under the slug' : '.'}
                </p>
              </>
            ) : (
              <>
                <h2 className={styles.confirmTitle} id="calm-publish-title">
                  {isFirstPublish ? `Schedule this ${kind.singular}?` : 'Schedule these changes?'}
                </h2>
                <label className={styles.confirmText} htmlFor="calm-schedule-when">
                  {isFirstPublish ? 'It goes live by itself, at' : 'They go live by themselves, at'}
                </label>
                <input
                  className={styles.when}
                  id="calm-schedule-when"
                  type="datetime-local"
                  autoFocus
                  value={when}
                  min={toLocalInput(new Date())}
                  aria-invalid={whenProblem}
                  aria-describedby={whenProblem ? 'calm-schedule-problem' : undefined}
                  onChange={(event) => {
                    setWhen(event.currentTarget.value)
                    setWhenProblem(false)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void schedule(plan)
                    }
                  }}
                />
                {whenProblem && (
                  <p className={styles.whenProblem} id="calm-schedule-problem" role="alert">
                    Choose a time that’s still ahead.
                  </p>
                )}
                {(plan.url || plan.slug) && (
                  <p className={styles.confirmText}>{plan.url ? 'It will be at' : 'It will be under the slug'}</p>
                )}
              </>
            )}
            {(plan.url || plan.slug) && (
              <p className={styles.where}>{plan.url ? `${plan.url.host}${plan.url.pathname}` : plan.slug}</p>
            )}
            <div className={styles.confirmActions}>
              {canSchedule && when === null && (
                <QuietButton
                  className={styles.scheduleInstead}
                  onClick={() => setWhen(toLocalInput(suggestedTime(previousTime)))}
                >
                  Schedule for later
                </QuietButton>
              )}
              <QuietButton onClick={cancel}>Not yet</QuietButton>
              {when === null ? (
                <button className={styles.publishPill} ref={confirmButton} type="button" onClick={() => void publish(plan)}>
                  {isFirstPublish ? 'Publish now' : 'Publish changes'}
                </button>
              ) : (
                <button className={styles.publishPill} type="button" onClick={() => void schedule(plan)}>
                  Schedule
                </button>
              )}
            </div>
          </FloatingSurface>
        </Floating>
      )}
    </>
  )
}

export function UnlockButton({
  handle,
  schedule,
  scheme,
  onProblem,
  onNotice,
  onUnlocked,
}: {
  handle: DocumentHandle
  schedule: Exclude<Schedule, {kind: 'none'}>
  scheme: string
  onProblem: (problem: string | null) => void
  onNotice: (notice: RoomNotice) => void
  onUnlocked: (scheduledFor: string | undefined) => void
}) {
  const client = useClient({apiVersion: API_VERSION})
  const kind = useWritingKind(handle.documentType)
  const [phase, setPhase] = useState<'idle' | 'asking' | 'unlocking'>('idle')
  const cancel = useCallback(() => setPhase((current) => (current === 'asking' ? 'idle' : current)), [])
  const asking = phase === 'asking'
  const {anchor, button, panel, answer, onKeyDown} = useAskOnce(asking, cancel)

  async function unlock() {
    setPhase('unlocking')
    try {
      const {scheduledFor} = await unlockPost(client, {
        documentId: handle.documentId,
        releaseId: schedule.releaseId,
        dateField: kind.fields.publishedAt,
      })
      onProblem(null)
      onUnlocked(scheduledFor)
      onNotice({text: 'Unlocked. Schedule it again when you’re ready.'})
    } catch {
      onProblem(`This ${kind.singular} couldn’t be unlocked just now. Try again in a moment.`)
    } finally {
      setPhase('idle')
    }
  }

  if (schedule.kind === 'settling' && phase === 'idle') return null

  return (
    <>
      <QuietButton
        ref={button}
        disabled={phase === 'unlocking'}
        aria-haspopup="dialog"
        aria-expanded={asking}
        onClick={() => setPhase(asking ? 'idle' : 'asking')}
      >
        {phase === 'unlocking' ? 'Unlocking…' : 'Unlock'}
      </QuietButton>
      {asking && anchor && (
        <Floating anchor={anchor} placement="below" scheme={scheme} onKeyDown={onKeyDown}>
          <FloatingSurface className={styles.confirm} ref={panel} role="dialog" aria-labelledby="calm-unlock-title">
            <h2 className={styles.confirmTitle} id="calm-unlock-title">Unlock this {kind.singular}?</h2>
            <p className={styles.confirmText}>
              {schedule.kind === 'scheduled'
                ? `It’s set to go live ${formatGoLive(schedule.publishAt)}. Unlocking takes it off the schedule until you schedule it again.`
                : 'It isn’t scheduled just now, so it won’t go live. Unlocking lets you change it and schedule it again.'}
            </p>
            <div className={styles.confirmActions}>
              <QuietButton onClick={cancel}>Not yet</QuietButton>
              <button className={styles.publishPill} ref={answer} type="button" onClick={() => void unlock()}>
                Unlock
              </button>
            </div>
          </FloatingSurface>
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
