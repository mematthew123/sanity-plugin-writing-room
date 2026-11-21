import {type ReactNode, useState} from 'react'
import {
  type DocumentActionComponent,
  type DocumentActionDescription,
  type DocumentActionsContext,
  useDocumentOperation,
} from 'sanity'
import {useDocumentPane} from 'sanity/structure'

/**
 * Document actions for the dev Studio's lock notes (e2e/lock-notes.ts), so the room can be tried
 * against a Studio that changed `document.actions`: an action of its own first, each kind of
 * dialog, an action for the pane's menu only, Publish removed, and an action that needs the form.
 */

/** A dialog the action draws itself, as a `custom` dialog is. */
function OwnDialog({label, children}: {label: string; children: ReactNode}) {
  return (
    <div
      role="dialog"
      aria-label={label}
      style={{position: 'fixed', inset: '20% 30%', zIndex: 100000, padding: 24, background: 'Canvas', color: 'CanvasText'}}
    >
      {children}
    </div>
  )
}

/**
 * The Review Note's first step. Nothing to show once the note is in review or approved, so the
 * next action takes the button. Disabled, with a reason, until the note has a title.
 */
const RequestReview: DocumentActionComponent = ({id, type, draft, published, onComplete}) => {
  const {patch} = useDocumentOperation(id, type)
  const [asking, setAsking] = useState(false)
  const note = draft ?? published
  if (note?.status) return null

  const close = () => {
    setAsking(false)
    onComplete()
  }
  const send = () => {
    patch.execute([{set: {status: 'inReview'}}])
    close()
  }
  const question = 'Send this note to an editor?'
  const answers = (
    <>
      <button type="button" onClick={send}>
        Send for review
      </button>
      <button type="button" onClick={close}>
        Keep writing
      </button>
    </>
  )
  const dialogs: Record<string, DocumentActionDescription['dialog']> = {
    confirm: {type: 'confirm', message: question, onConfirm: send, onCancel: close},
    popover: {
      type: 'popover',
      onClose: close,
      content: (
        <div style={{padding: 16}}>
          <p>{question}</p>
          {answers}
        </div>
      ),
    },
    dialog: {type: 'dialog', header: 'Request review', content: <p>{question}</p>, footer: answers, onClose: close},
    custom: {
      type: 'custom',
      component: (
        <OwnDialog label="Request review">
          <p>{question}</p>
          {answers}
        </OwnDialog>
      ),
    },
  }
  const dialog = typeof note?.ask === 'string' ? dialogs[note.ask] : undefined

  return {
    label: 'Request review',
    disabled: !note?.title,
    title: note?.title ? undefined : 'Give the note a title first.',
    onHandle: dialog ? () => setAsking(true) : send,
    dialog: asking && dialog,
  }
}

/** The Review Note's second step. Approving locks the note: its type is read-only once approved. */
const Approve: DocumentActionComponent = ({id, type, draft, published, onComplete}) => {
  const {patch} = useDocumentOperation(id, type)
  const [asking, setAsking] = useState(false)
  if ((draft ?? published)?.status !== 'inReview') return null

  const close = () => {
    setAsking(false)
    onComplete()
  }
  return {
    label: 'Approve',
    tone: 'positive',
    onHandle: () => setAsking(true),
    dialog: asking && {
      type: 'confirm',
      message: 'Approve this note? It takes no more changes once it’s approved.',
      confirmButtonText: 'Approve',
      cancelButtonText: 'Not now',
      onConfirm: () => {
        patch.execute([{set: {status: 'approved'}}])
        close()
      },
      onCancel: close,
    },
  }
}

/** An action for the pane's menu alone, which the room passes over. It clears `field`. */
function clears(field: string, label: string): DocumentActionComponent {
  const Clears: DocumentActionComponent = ({id, type, draft, published, onComplete}) => {
    const {patch} = useDocumentOperation(id, type)
    if (!(draft ?? published)?.[field]) return null
    return {
      label,
      group: ['paneActions'],
      onHandle: () => {
        patch.execute([{unset: [field]}])
        onComplete()
      },
    }
  }
  Clears.displayName = `Clears(${field})`
  return Clears
}

/**
 * Takes a Review Note back to the start. It is always in the form's menu, where the room passes
 * it over. Once the note is approved and published, with nothing new to publish, it is the next
 * step too, and takes the button: the Writer opens the note again to change it.
 */
const Reopen: DocumentActionComponent = ({id, type, draft, published, onComplete}) => {
  const {patch} = useDocumentOperation(id, type)
  const status = (draft ?? published)?.status
  if (!status) return null
  const isNextStep = status === 'approved' && !draft
  return {
    label: 'Reopen',
    group: isNextStep ? ['default', 'paneActions'] : ['paneActions'],
    onHandle: () => {
      patch.execute([{unset: ['status']}])
      onComplete()
    },
  }
}
/** The way out of a Locked Note with everything locked, from the form's menu. */
const OpenForChanges = clears('lock', 'Open for changes')

/** Written for the form: outside a document pane, `useDocumentPane` throws. */
const OnlyInTheForm: DocumentActionComponent = ({onComplete}) => {
  useDocumentPane()
  return {label: 'Only in the form', onHandle: onComplete}
}

export function lockNoteActions(
  previous: DocumentActionComponent[],
  {schemaType}: DocumentActionsContext,
): DocumentActionComponent[] {
  switch (schemaType) {
    case 'lockedNote':
      return [...previous, OpenForChanges]
    case 'reviewNote':
      // Reopen comes first: while it's for the menu alone, it never takes the button.
      return [Reopen, RequestReview, Approve, ...previous]
    case 'noPublishNote':
      return previous.filter((action) => action.action !== 'publish')
    case 'formOnlyNote':
      return [OnlyInTheForm, ...previous]
    default:
      return previous
  }
}
