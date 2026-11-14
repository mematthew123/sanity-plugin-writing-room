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
import styled, {keyframes} from 'styled-components'
import {useWritingRoomConfig} from '../config'
import {API_VERSION} from '../lib/api-version'
import {clockName, defaultPromisedTime, describePromisedTime, isAhead} from '../lib/promised-time'
import {detailsForPublish, type PublishDetails} from '../lib/publish-details'
import {slugTakenByAnother} from '../lib/slug-availability'
import {addImageLabel, detailsPatch, readPublishable} from './fields'
import {type PublishablePost} from '../lib/publish-details'
import {goToProblem} from './go-to-problem'
import {Floating, FloatingSurface, useViewportChanges} from './editor/floating'
import {useWritingKind} from './kinds'
import {useRoomView} from './navigation'
import {type PostStatus} from './post-status'
import {presenceSentence} from './presence'
import {NARROW, QuietButton} from './primitives'
import {type Marker, publishProblems} from './publish-problems'
import {changeTime, OffTheSchedule, publishHeld, scheduleAgain, schedulePost} from './schedule'
import {type JustPromised, type PostCopy, scheduleClient} from './scheduling'
import {fromLocalDateTime, toLocalDateTime} from './details/values'

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

const RoomSynced = createContext(true)

/**
 * The Prose saves through the App SDK and Details through the Studio's own store, so the room is
 * only saved once both have caught up. Watched once here, for everything in the room that asks.
 */
export function RoomSyncProvider({
  handle,
  releaseId,
  children,
}: {
  handle: DocumentHandle
  /** The release whose copy is open, when it isn't the draft. */
  releaseId: string | null
  children: ReactNode
}) {
  const proseSynced = useDocumentSyncStatus(handle) ?? true
  const details = useSyncState(handle.documentId, handle.documentType, releaseId ?? undefined)
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

/** Long enough for a save, a read of the saved copy, and a validation of it. */
const SETTLE_TIMEOUT_MS = 6000

interface PublishPlan {
  details: PublishDetails
  /** Set when the Studio has said where its site is. */
  url: URL | null
  /** Shown instead of `url` when there isn't one. */
  slug: string | undefined
  /** The slug and date the plan was made from. If they've moved by the time the Writer says yes, the plan is off. */
  basis: PublishablePost
  /** The revision that was checked. Scheduling copies the Post, so it copies exactly this. */
  revision: string | undefined
}

type SavedCopy = Record<string, unknown> & {_rev?: string}

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

/**
 * What the one panel under the button is showing. It asks once whether to publish; "Choose a time"
 * gives way, in place, to a date and time; and on a Scheduled Post it says when, and what can be done.
 */
type PanelView = 'ask' | 'time' | 'promised'

/**
 * The one thing to do next. For a Draft: waits for the latest words to sync and validate, goes to
 * any problem, then asks once before publishing, now or at a time. For a Scheduled Post there is
 * nothing to do, so the button is quiet and says so; its panel is where the promise can be changed.
 */
export function PublishButton({
  copy,
  status,
  scheme,
  canSchedule,
  onProblem,
  onNotice,
  onPromised,
  onTakeOff,
}: {
  copy: PostCopy
  status: PostStatus
  scheme: string
  /** Whether the Studio offers scheduling here. Without it there is no "Choose a time". */
  canSchedule: boolean
  onProblem: (problem: string | null) => void
  onNotice: (notice: RoomNotice) => void
  /** The Post has just been scheduled into a release of its own. */
  onPromised: (promised: JustPromised) => void
  /** "Edit it": takes a Scheduled Post off the schedule. */
  onTakeOff: () => Promise<void>
}) {
  const {handle, openId, releaseId} = copy
  const editor = useEditor()
  const client = useClient({apiVersion: API_VERSION})
  const apply = useApplyDocumentActions()
  const isSynced = useRoomSynced()
  const validation = useValidationStatus(openId, handle.documentType)
  const settled = useValidated(validation)
  const [saved, setSaved] = useState<SavedCopy | null>(null)
  const {openDetails} = useRoomView(handle)
  const kind = useWritingKind(handle.documentType)
  const {preview: site} = useWritingRoomConfig()
  const [phase, setPhase] = useState<'idle' | 'checking' | 'preparing' | 'confirming' | 'publishing' | 'scheduling'>('idle')
  const [view, setView] = useState<PanelView>('ask')
  const [time, setTime] = useState('')
  const [timedOut, setTimedOut] = useState(false)
  const [plan, setPlan] = useState<PublishPlan | null>(null)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const firstAnswer = useRef<HTMLButtonElement>(null)
  const timeInput = useRef<HTMLInputElement>(null)
  const isFirstPublish = !status.isPublished
  const promisedFor = status.promisedFor
  // A Post that was taken off the schedule goes back on it, unless the Studio has since turned scheduling off.
  const next = status.next === 'schedule-again' && !canSchedule ? (isFirstPublish ? 'publish' : 'publish-changes') : status.next
  const couldnt = (what: string) => `This ${kind.singular} couldn’t be ${what} just now. Try again in a moment.`

  useEffect(() => {
    if (phase !== 'checking') return undefined
    const timer = setTimeout(() => setTimedOut(true), SETTLE_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [phase])

  // The copy as it is saved, read again whenever validation moves on to another revision. Both
  // stores write to it, so only the server knows which revision is the latest.
  useEffect(() => {
    if (phase !== 'checking' || !isSynced) return undefined
    let superseded = false
    client.getDocument<SavedCopy>(openId).then(
      (document) => {
        if (!superseded) setSaved(document ?? null)
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
  }, [phase, isSynced, validation.revision, client, openId, kind.singular, onProblem])

  useEffect(() => {
    if (phase !== 'checking') return
    // Two things make validation a verdict on what would be published. It has settled: `revision`
    // moves on the moment the copy does, before the markers do. And its revision is the saved
    // copy's: the Prose saves through another store, which the Studio's hears of a moment later.
    const validated = settled && !!saved?._rev && validation.revision === saved._rev
    if (!isSynced || !saved || !validated) {
      // Never publish on stale sync or validation: the SDK's publish doesn't enforce the schema.
      if (timedOut) {
        setPhase('idle')
        onProblem(
          isSynced
            ? `Still checking this ${kind.singular}. Try again in a moment.`
            : 'Still saving your latest changes. Try again in a moment.',
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
        const basis = readPublishable(saved, fields)
        const details = await detailsForPublish({
          post: basis,
          isFirstPublish,
          isTaken: slugTakenByAnother(client, handle.documentType, fields.slug, handle.documentId),
          // A date the room wrote for a promise that is now off is the room's to write again.
          promisedBefore: promisedFor,
        })
        const slug = fields.slug ? (details.slug?.current ?? basis.slug?.current) : undefined
        setPlan({
          details,
          slug,
          basis,
          revision: saved._rev,
          url: site && slug ? liveUrl(site, slug, handle.documentType) : null,
        })
        onProblem(null)
        // Taken off the schedule, the next step is to go back on it: the panel opens on the time.
        setView(next === 'schedule-again' ? 'time' : 'ask')
        setTime(toLocalDateTime(next === 'schedule-again' && promisedFor ? promisedFor : defaultPromisedTime()))
        setPhase('confirming')
      } catch {
        onProblem(`This ${kind.singular} couldn’t be published just now. Try again in a moment.`)
        setPhase('idle')
      }
    })()
  }, [phase, timedOut, isSynced, validation, settled, saved, isFirstPublish, promisedFor, next, client, handle, editor, openDetails, kind, site, onProblem])

  const cancel = useCallback(() => {
    setPhase('idle')
    setPlan(null)
  }, [])

  const confirming = phase === 'confirming'
  const measure = useCallback(() => {
    setAnchor(confirming ? (button.current?.getBoundingClientRect() ?? null) : null)
  }, [confirming])
  useEffect(measure, [measure])
  useViewportChanges(measure)

  // The Writer asked a moment ago, so Enter should finish the thought. Focus moves once the
  // popover has been placed (it's hidden, and can't take focus, until then), and again when the
  // panel gives way to the time.
  const open = confirming && !!anchor
  useEffect(() => {
    if (!open) return undefined
    const frame = requestAnimationFrame(() => (view === 'time' ? timeInput : firstAnswer).current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [open, view])

  useEffect(() => {
    if (!confirming) return undefined
    const close = (event: PointerEvent) => {
      const target = event.target as Node
      if (!panel.current?.contains(target) && !button.current?.contains(target)) cancel()
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [confirming, cancel])

  /** The open copy as it is saved now, or null (with the reason said) if the plan no longer fits it. */
  async function stillAsPlanned({basis}: PublishPlan): Promise<SavedCopy | null | undefined> {
    // The plan's slug and date were settled when the room asked. If someone has changed either
    // since, in Details or from elsewhere, writing the plan now would undo their change.
    const document = await client.getDocument<SavedCopy>(openId)
    const now = readPublishable(document, kind.fields)
    if (now.slug?.current !== basis.slug?.current || now.publishedAt !== basis.publishedAt) {
      onProblem(`This ${kind.singular}’s details changed while you were deciding. Try again to use them.`)
      return null
    }
    return document
  }

  async function publish(planned: PublishPlan) {
    setPhase('publishing')
    try {
      const {fields} = kind
      const document = await stillAsPlanned(planned)
      if (document === null) return
      // The date is when the Writer said yes, not when the room asked.
      const {details, url} = planned
      const patch = detailsPatch(
        details.publishedAt ? {...details, publishedAt: new Date().toISOString()} : details,
        fields,
      )
      if (releaseId) {
        // Taken off the schedule and published after all: its copy is what goes live.
        await publishHeld(scheduleClient(client), {documentId: handle.documentId, releaseId, set: patch})
      } else {
        const edit = Object.keys(patch).length > 0 ? [editDocument(handle, {set: patch})] : []
        await apply([...edit, publishDocument(handle)])
      }
      onProblem(null)
      const image = fields.image ? (document?.[fields.image] as {asset?: unknown} | undefined) : undefined
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
      onProblem(couldnt('published'))
    } finally {
      setPhase('idle')
      setPlan(null)
    }
  }

  /** Promises the Post for `at`: a Draft for the first time, or one that was taken off the schedule, again. */
  async function schedule(planned: PublishPlan, at: string) {
    setPhase('scheduling')
    try {
      const {fields} = kind
      const document = await stillAsPlanned(planned)
      if (document === null) return
      if (!document || document._rev !== planned.revision) {
        // What was checked is what gets promised. Anything newer is checked first.
        onProblem(`This ${kind.singular} changed while you were deciding. Try again to schedule it as it is now.`)
        return
      }
      // Nothing of the room's runs when the time comes, so the date is written now: the promised
      // time, when readers first see it.
      const details = await detailsForPublish({
        post: planned.basis,
        isFirstPublish,
        isTaken: slugTakenByAnother(client, handle.documentType, fields.slug, handle.documentId),
        now: at,
        promisedBefore: promisedFor,
      })
      const set = detailsPatch(details, fields)
      const tidy = scheduleClient(client)
      if (releaseId) {
        // The lookup took a moment, and this copy can still be written: look once more, and let
        // the write itself refuse a copy that has moved on.
        const latest = await client.getDocument<SavedCopy>(openId)
        if (!latest || latest._rev !== planned.revision) {
          onProblem(`This ${kind.singular} changed while you were deciding. Try again to schedule it as it is now.`)
          return
        }
        await scheduleAgain(tidy, {documentId: handle.documentId, releaseId, set, at, revision: planned.revision})
      } else {
        const made = await schedulePost(tidy, {documentId: handle.documentId, draft: document, set, at})
        onPromised({releaseId: made.releaseId, promise: {at, held: false}})
      }
      onProblem(null)
      onNotice({text: `Scheduled for ${describePromisedTime(at)}`, done: true})
    } catch {
      onProblem(couldnt('scheduled'))
    } finally {
      setPhase('idle')
      setPlan(null)
    }
  }

  /** "Change the time" on a Scheduled Post. Its words are locked and already checked; only the promise moves. */
  async function reschedule(at: string, was: string) {
    if (!releaseId) return
    setPhase('scheduling')
    try {
      const {fields} = kind
      const document = await client.getDocument<SavedCopy>(openId)
      const details = await detailsForPublish({
        post: readPublishable(document, fields),
        isFirstPublish: false,
        isTaken: slugTakenByAnother(client, handle.documentType, fields.slug, handle.documentId),
        now: at,
        promisedBefore: was,
      })
      const set = detailsPatch(details, fields)
      await changeTime(scheduleClient(client), {documentId: handle.documentId, releaseId, set, at, was})
      onProblem(null)
      onNotice({text: `Scheduled for ${describePromisedTime(at)}`, done: true})
    } catch (error) {
      onProblem(
        error instanceof OffTheSchedule
          ? `The time couldn’t be changed, and this ${kind.singular} is off the schedule for now. Schedule it again when you’re ready.`
          : `The time couldn’t be changed just now. It is still scheduled for ${describePromisedTime(was)}.`,
      )
    } finally {
      setPhase('idle')
    }
  }

  async function takeOff() {
    setPhase('scheduling')
    try {
      await onTakeOff()
    } finally {
      setPhase('idle')
    }
  }

  if (next === null && phase === 'idle') return null

  const working = phase === 'checking' || phase === 'preparing' || phase === 'publishing' || phase === 'scheduling'
  const scheduled = next === 'scheduled'
  const label = scheduled
    ? 'Scheduled'
    : next === 'schedule-again'
      ? 'Schedule again'
      : isFirstPublish
        ? 'Publish'
        : 'Publish changes'
  const busy = phase === 'publishing' ? 'Publishing…' : phase === 'scheduling' ? 'Scheduling…' : 'Checking…'

  const chosen = fromLocalDateTime(time)
  const ahead = isAhead(chosen)
  const confirmTime = () => {
    if (!chosen || !ahead) return
    if (scheduled && promisedFor) void reschedule(chosen, promisedFor)
    else if (plan) void schedule(plan, chosen)
  }

  const Pill = scheduled ? ScheduledPill : PublishPill
  return (
    <>
      <Pill
        ref={button}
        type="button"
        disabled={working}
        aria-haspopup="dialog"
        aria-expanded={confirming}
        onClick={() => {
          if (confirming) return cancel()
          if (scheduled) {
            // Nothing to check: a Scheduled Post's words are locked, and were checked to get there.
            setView('promised')
            setTime(toLocalDateTime(promisedFor))
            setPhase('confirming')
            return
          }
          setTimedOut(false)
          setSaved(null)
          setPhase('checking')
        }}
      >
        {working && !(scheduled && phase !== 'scheduling') ? busy : label}
      </Pill>
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
            {view === 'ask' && plan && (
              <>
                <ConfirmTitle id="calm-publish-title">
                  {isFirstPublish ? `Publish this ${kind.singular}?` : 'Publish these changes?'}
                </ConfirmTitle>
                <ConfirmText>
                  {isFirstPublish ? 'It goes live straight away' : 'They replace what readers see now'}
                  {plan.url ? ', at' : plan.slug ? ', under the slug' : '.'}
                </ConfirmText>
                {(plan.url || plan.slug) && (
                  <Where>{plan.url ? `${plan.url.host}${plan.url.pathname}` : plan.slug}</Where>
                )}
                <ConfirmActions>
                  <QuietButton onClick={cancel}>Not yet</QuietButton>
                  <PublishPill ref={firstAnswer} type="button" onClick={() => void publish(plan)}>
                    {isFirstPublish ? 'Publish now' : 'Publish changes'}
                  </PublishPill>
                </ConfirmActions>
                {/* Only where it can work: a Studio without scheduling never sees the line. */}
                {canSchedule && (
                  <Another>
                    <QuietButton onClick={() => setView('time')}>Choose a time</QuietButton>
                  </Another>
                )}
              </>
            )}
            {view === 'time' && (
              <>
                <ConfirmTitle id="calm-publish-title">
                  {scheduled ? 'Change the time?' : isFirstPublish ? `Schedule this ${kind.singular}?` : 'Schedule these changes?'}
                </ConfirmTitle>
                <ConfirmText>{isFirstPublish ? 'It goes live at' : 'They go live at'}</ConfirmText>
                <TimeInput
                  ref={timeInput}
                  type="datetime-local"
                  aria-label="When it goes live"
                  aria-describedby="calm-publish-clock"
                  value={time}
                  min={toLocalDateTime(new Date().toISOString())}
                  onChange={(event) => setTime(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      confirmTime()
                    }
                  }}
                />
                {/* Whose clock, said once where the promise is made; or why it can't be made yet. */}
                <Clock id="calm-publish-clock">{ahead ? clockName() : 'Choose a time that is still ahead.'}</Clock>
                <ConfirmActions>
                  <QuietButton onClick={cancel}>Not yet</QuietButton>
                  <PublishPill type="button" disabled={!ahead} onClick={confirmTime}>
                    Schedule
                  </PublishPill>
                </ConfirmActions>
                {next === 'schedule-again' && plan && (
                  <Another>
                    <QuietButton onClick={() => void publish(plan)}>Publish now</QuietButton>
                  </Another>
                )}
              </>
            )}
            {view === 'promised' && promisedFor && (
              <>
                <ConfirmTitle id="calm-publish-title">Scheduled</ConfirmTitle>
                <ConfirmText>
                  {isFirstPublish ? 'This goes live' : 'These changes go live'} {describePromisedTime(promisedFor)}.
                </ConfirmText>
                {/* Neither is the next thing to do, so neither is clay. Esc leaves it as it is. */}
                <ConfirmActions>
                  <QuietButton ref={firstAnswer} onClick={() => void takeOff()}>
                    Edit it
                  </QuietButton>
                  {canSchedule && <QuietButton onClick={() => setView('time')}>Change the time</QuietButton>}
                </ConfirmActions>
              </>
            )}
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

/** A Scheduled Post has nothing waiting to be done, so its button is quiet: it says the state, and opens it. */
const ScheduledPill = styled.button`
  min-height: 2.25rem;
  padding: var(--calm-space-sm) var(--calm-space-md);
  border: 0;
  border-radius: var(--calm-radius-pill);
  background: transparent;
  color: var(--calm-color-ink-muted);
  font: inherit;
  cursor: pointer;
  transition: background var(--calm-motion-gentle) var(--calm-motion-easing);

  &:hover,
  &[aria-expanded='true'] {
    background: var(--calm-color-surface);
    color: var(--calm-color-ink);
  }

  &:disabled {
    cursor: default;
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

/** A second way to answer, set apart under the first two so the panel still asks one thing. */
const Another = styled.div`
  display: flex;
  justify-content: flex-end;
  margin-top: var(--calm-space-xs);
`

/** As a text field reads in Details: on the surface, with only a line beneath that turns clay. */
const TimeInput = styled.input`
  box-sizing: border-box;
  width: 100%;
  margin-top: var(--calm-space-xs);
  padding: var(--calm-space-sm) 0;
  border: 0;
  border-bottom: 1px solid var(--calm-color-rule);
  border-radius: 0;
  background: transparent;
  color: var(--calm-color-ink);
  color-scheme: inherit;
  font: inherit;
  font-weight: var(--calm-weight-ui-strong);
  transition: border-color var(--calm-motion-gentle) var(--calm-motion-easing);

  &:focus {
    outline: none;
    border-bottom-color: var(--calm-color-accent);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`

const Clock = styled.p`
  margin: var(--calm-space-xs) 0 0;
  color: var(--calm-color-ink-muted);
  font-size: var(--calm-type-ui-size-small);
`
