import {type DocumentHandle} from '@sanity/sdk-react'
import {Component, type ReactNode, Suspense, useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {createPortal} from 'react-dom'
import {
  type DocumentActionComponent,
  type DocumentActionDescription,
  type DocumentActionProps,
  GetHookCollectionState,
  isSanityDefinedAction,
  useClient,
  useEditState,
  useSource,
} from 'sanity'
import styled from 'styled-components'
import {isRoomPublishAction} from '../actions/publish-post'
import {API_VERSION} from '../lib/api-version'
import {nextStep, type Step, type StepKind, stepsToConsider} from '../lib/next-step'
import {Floating} from './editor/floating'
import {useOpenInStructure} from './navigation'
import {OpenInWritingRoomAction} from './OpenInWritingRoomAction'
import {QuietButton} from './primitives'
import {
  Confirm,
  ConfirmActions,
  ConfirmText,
  ConfirmTitle,
  PublishPill,
  SETTLE_TIMEOUT_MS,
  useAskOnce,
  useRoomSynced,
} from './room-status'

type StudioStep = Step<DocumentActionComponent>

/** What an action has to show, and which step it came from. */
type StepState = DocumentActionDescription & {writingRoomStep: number}

function kindOf(action: DocumentActionComponent): StepKind | 'skip' {
  if (action === OpenInWritingRoomAction) return 'skip'
  if (isRoomPublishAction(action)) return 'room'
  // Anything still called `publish` that isn't this plugin's is a Studio's own Publish.
  const sanitys = action.action !== 'publish' && isSanityDefinedAction({label: '', action: action.action})
  return sanitys ? 'builtin' : 'custom'
}

/** Null when the Studio's actions can't be read: the room then offers its own Publish. */
function useSteps({documentId, documentType}: DocumentHandle): StudioStep[] | null {
  const {document} = useSource()
  return useMemo(() => {
    try {
      const actions = document.actions({
        schemaType: documentType,
        documentId,
        releaseId: undefined,
        versionType: 'draft',
      })
      return stepsToConsider(actions, kindOf)
    } catch (error) {
      console.error('[sanity-plugin-writing-room] The Studio’s document actions couldn’t be read.', error)
      return null
    }
  }, [document, documentId, documentType])
}

/**
 * The room's one button. It is the room's own Publish unless the Studio has put an action of its
 * own first in `document.actions` ("Request review"): then the room offers that one instead, run
 * as the Studio's form runs it. A Studio that removed Publish and put nothing in its place gets
 * no button.
 */
export function NextStep({
  handle,
  scheme,
  publish,
  onProblem,
}: {
  handle: DocumentHandle
  scheme: string
  /** The room's own Publish, or nothing when the Writer may not publish. */
  publish: ReactNode
  onProblem: (problem: string | null) => void
}) {
  const steps = useSteps(handle)
  const openInStructure = useOpenInStructure(handle)
  const first = steps === null ? 'room' : steps[0]?.kind
  if (first === 'room') return publish
  if (!steps || first !== 'custom') return null
  return (
    <StepBoundary key={handle.documentId} onOpenInStructure={openInStructure}>
      <Suspense fallback={null}>
        <StudioSteps handle={handle} steps={steps} scheme={scheme} publish={publish} onProblem={onProblem} />
      </Suspense>
    </StepBoundary>
  )
}

/** Runs the Studio's actions as hooks, the way its form does, and shows the first with something to show. */
function StudioSteps({
  handle,
  steps,
  scheme,
  publish,
  onProblem,
}: {
  handle: DocumentHandle
  steps: StudioStep[]
  scheme: string
  publish: ReactNode
  onProblem: (problem: string | null) => void
}) {
  const editState = useEditState(handle.documentId, handle.documentType)
  const reset = useRef<(() => void) | null>(null)

  // Only a Studio's own actions are run. Sanity's are stood in for: they were written for the form.
  const hooks = useMemo(
    () =>
      steps.map((step, index) => {
        const {action} = step
        const StudioAction = (props: DocumentActionProps): StepState | null => {
          const shown = action(props)
          return shown ? {...shown, writingRoomStep: index} : null
        }
        const StandIn = (): StepState => ({label: '', writingRoomStep: index})
        return step.kind === 'custom' ? StudioAction : StandIn
      }),
    [steps],
  )
  const args = useMemo<DocumentActionProps>(
    () => ({
      ...editState,
      revision: undefined,
      initialValueResolved: true,
      // An action says it's finished; its state starts over, as it does in the form.
      onComplete: () => reset.current?.(),
    }),
    [editState],
  )

  return (
    <GetHookCollectionState<DocumentActionProps, StepState> hooks={hooks} args={args} resetRef={reset}>
      {({states}) => {
        // The form's main button only takes actions in its `default` group, which is where an
        // action without a group goes. One meant for the pane's menu alone is passed over.
        const forTheButton = states.filter((state) => (state.group ?? ['default']).includes('default'))
        const next = nextStep(steps, (_step, index) => forTheButton.some((state) => state.writingRoomStep === index))
        if (!next || next.step.kind === 'builtin') return null
        if (next.step.kind === 'room') return publish
        const state = forTheButton.find((candidate) => candidate.writingRoomStep === next.index)
        if (!state) return null
        return (
          <StudioActionButton
            // Another action taking this one's place starts afresh: it was never clicked.
            key={`${handle.documentId}:${next.index}`}
            handle={handle}
            state={state}
            draftRevision={editState.draft?._rev ?? null}
            scheme={scheme}
            onProblem={onProblem}
          />
        )
      }}
    </GetHookCollectionState>
  )
}

function StudioActionButton({
  handle,
  state,
  draftRevision,
  scheme,
  onProblem,
}: {
  handle: DocumentHandle
  state: StepState
  /** The draft as the Studio's store has it, which is what the action reads. */
  draftRevision: string | null
  scheme: string
  onProblem: (problem: string | null) => void
}) {
  const client = useClient({apiVersion: API_VERSION})
  const isSynced = useRoomSynced()
  const latest = useRef(state)
  useEffect(() => {
    latest.current = state
  })

  // The Prose saves through another store than the one the action reads. So before the action
  // runs, the room waits for its words to be saved and for the Studio's store to have them.
  const [settling, setSettling] = useState(false)
  // The saved draft's revision, kept only while it was read with the room saved and the Studio's
  // draft as it is now. Anything read before a later save, or a later draft, says nothing.
  const [savedRevision, setSavedRevision] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    if (!settling) return undefined
    const timer = setTimeout(() => {
      setSettling(false)
      onProblem('Still saving your latest changes. Try again in a moment.')
    }, SETTLE_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [settling, onProblem])

  // A click is on the action as it was. If it has since become disabled, the click is off.
  const disabled = !!state.disabled
  useEffect(() => {
    if (settling && disabled) setSettling(false)
  }, [settling, disabled])

  useEffect(() => {
    setSavedRevision(undefined)
    if (!settling || !isSynced) return undefined
    let superseded = false
    client.getDocument<{_rev?: string}>(`drafts.${handle.documentId}`).then(
      (saved) => {
        if (!superseded) setSavedRevision(saved?._rev ?? null)
      },
      () => {
        if (superseded) return
        setSettling(false)
        onProblem('That couldn’t be done just now. Try again in a moment.')
      },
    )
    return () => {
      superseded = true
    }
  }, [settling, isSynced, draftRevision, client, handle.documentId, onProblem])

  useEffect(() => {
    if (!settling || !isSynced || savedRevision === undefined || savedRevision !== draftRevision) return
    setSettling(false)
    setSavedRevision(undefined)
    if (latest.current.disabled) return
    onProblem(null)
    latest.current.onHandle?.()
  }, [settling, isSynced, savedRevision, draftRevision, onProblem])

  const dialog = state.dialog || null
  // A question or a popover sits under the button, like the room's own; anything bigger is the Studio's.
  const anchored = dialog?.type === 'confirm' || dialog?.type === 'popover'
  const close = useCallback(() => {
    const open = latest.current.dialog
    if (!open || open.type === 'custom') return
    if (open.type === 'confirm') open.onCancel()
    else open.onClose()
  }, [])
  const {anchor, button, panel, answer, onKeyDown} = useAskOnce(anchored, close)

  return (
    <>
      <PublishPill
        ref={button}
        type="button"
        disabled={settling || !!state.disabled}
        title={typeof state.title === 'string' ? state.title : undefined}
        aria-haspopup={anchored ? 'dialog' : undefined}
        aria-expanded={anchored ? true : undefined}
        onClick={() => {
          if (anchored) return close()
          setSettling(true)
        }}
      >
        {settling ? 'Saving…' : state.label}
      </PublishPill>
      {dialog?.type === 'confirm' && anchor && (
        <Floating anchor={anchor} placement="below" scheme={scheme} onKeyDown={onKeyDown}>
          <Confirm ref={panel} role="dialog" aria-labelledby="calm-step-title">
            <ConfirmTitle id="calm-step-title">{state.label}</ConfirmTitle>
            <ConfirmText as="div">{dialog.message}</ConfirmText>
            <ConfirmActions>
              <QuietButton onClick={dialog.onCancel}>{dialog.cancelButtonText ?? 'Not yet'}</QuietButton>
              <PublishPill ref={answer} type="button" onClick={dialog.onConfirm}>
                {dialog.confirmButtonText ?? state.label}
              </PublishPill>
            </ConfirmActions>
          </Confirm>
        </Floating>
      )}
      {dialog?.type === 'popover' && anchor && (
        <Floating anchor={anchor} placement="below" scheme={scheme} onKeyDown={onKeyDown}>
          <Confirm ref={panel} role="dialog" aria-label={state.label}>
            {dialog.content}
          </Confirm>
        </Floating>
      )}
      {dialog?.type === 'custom' && dialog.component}
      {dialog && (dialog.type === 'dialog' || dialog.type === undefined) && (
        <StepModal label={state.label} scheme={scheme} header={dialog.header} footer={dialog.footer as ReactNode} onClose={dialog.onClose}>
          {dialog.content}
        </StepModal>
      )}
    </>
  )
}

/** A Studio action's own dialog, over the room. What's inside is the Studio's. */
function StepModal({
  label,
  scheme,
  header,
  footer,
  onClose,
  children,
}: {
  label: string
  scheme: string
  header: ReactNode
  footer: ReactNode
  onClose: () => void
  children: ReactNode
}) {
  const surface = useRef<HTMLDivElement>(null)
  useEffect(() => {
    surface.current?.focus()
  }, [])

  return createPortal(
    <Backdrop
      data-calm-floating=""
      data-scheme={scheme}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.stopPropagation()
        onClose()
      }}
    >
      <Modal ref={surface} role="dialog" aria-modal aria-labelledby="calm-step-modal-title" tabIndex={-1}>
        <ConfirmTitle id="calm-step-modal-title">{header ?? label}</ConfirmTitle>
        {children}
        <ConfirmActions>{footer ?? <QuietButton onClick={onClose}>Close</QuietButton>}</ConfirmActions>
      </Modal>
    </Backdrop>,
    document.body,
  )
}

/** Fails soft: an action written for the form that can't run here never takes the room down with it. */
class StepBoundary extends Component<{children: ReactNode; onOpenInStructure: () => void}, {failed: boolean}> {
  state = {failed: false}

  static getDerivedStateFromError() {
    return {failed: true}
  }

  componentDidCatch(error: unknown) {
    console.error('[sanity-plugin-writing-room] The Studio’s action couldn’t run in the room.', error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return <QuietButton onClick={this.props.onOpenInStructure}>Open in Structure</QuietButton>
  }
}

const Backdrop = styled.div`
  position: fixed;
  z-index: 1000;
  inset: 0;
  display: grid;
  place-items: center;
  padding: var(--calm-space-md);
  background: color-mix(in srgb, var(--calm-color-paper) 70%, transparent);
  color: var(--calm-color-ink);
  font-family: var(--calm-font-ui);
  font-size: var(--calm-type-ui-size);
  font-weight: var(--calm-weight-ui);
`

const Modal = styled(Confirm)`
  width: min(32rem, calc(100vw - 24px));

  &:focus {
    outline: none;
  }
`
