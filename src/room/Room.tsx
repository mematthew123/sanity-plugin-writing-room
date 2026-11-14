import {EditorProvider, useEditor} from '@portabletext/editor'
import {ArrowLeftIcon} from '@sanity/icons/ArrowLeft'
import {
  discardDocument,
  type DocumentHandle,
  useApplyDocumentActions,
  useDocument,
  useDocumentProjection,
} from '@sanity/sdk-react'
import {type RefObject, Suspense, useCallback, useEffect, useRef, useState} from 'react'
import {useClient, useColorSchemeValue, useDataset, useEditState, useProjectId} from 'sanity'
import {useRouter} from 'sanity/router'
import styled, {keyframes} from 'styled-components'
import {API_VERSION} from '../lib/api-version'
import {describePromisedTime} from '../lib/promised-time'
import {DetailsBoundary} from './details/DetailsBoundary'
import {DetailsView} from './details/DetailsView'
import {useSwap} from './details/use-swap'
import {BodyEditor} from './editor/BodyEditor'
import {useBodySchema} from './editor/schema'
import {didComeFromForm} from './came-from'
import {useWritingKind} from './kinds'
import {rememberLastOpened} from './last-opened'
import {isEmptyPost} from './empty-post'
import {type WritingFields} from './fields'
import {askForFirstDetail, useOpenInStructure, useRoomView} from './navigation'
import {RoomSettingsMenu, WordCount} from './comfort'
import {describePostStatus} from './post-status'
import {PreviewButton} from './PreviewButton'
import {
  Column,
  NARROW,
  NO_MARGIN,
  Placeholder,
  QuietButton,
  Recedes,
  RoomControls,
  WideOnly,
} from './primitives'
import {
  Presence,
  PublishButton,
  RoomMessage,
  type RoomNotice,
  RoomSyncProvider,
  SaveState,
  StatusLabel,
} from './room-status'
import {useRoomSettings} from './room-settings'
import {takeOffSchedule} from './schedule'
import {type JustPromised, type PostCopy, PostCopyProvider, scheduleClient, useCanSchedule} from './scheduling'
import {TitleField} from './TitleField'
import {useEscape} from './use-escape'
import {useRecede} from './use-recede'

export function Room({documentId, documentType}: {documentId: string; documentType: string}) {
  const [problem, setProblem] = useState<string | null>(null)
  // Kept out here: when a Post is scheduled the room opens its Scheduled copy, and "Scheduled for…"
  // has to outlast the change.
  const [notice, setNotice] = useState<RoomNotice | null>(null)
  const [justPromised, setJustPromised] = useState<JustPromised | null>(null)
  const caughtUp = useCallback(() => setJustPromised(null), [])

  useEffect(() => {
    if (!notice) return undefined
    const visibleFor = notice.link || notice.action ? NOTICE_WITH_NEXT_STEP_MS : NOTICE_VISIBLE_MS
    const timer = setTimeout(() => setNotice(null), visibleFor)
    return () => clearTimeout(timer)
  }, [notice])

  return (
    <Suspense fallback={<LoadingRoom />}>
      <PostCopyProvider
        documentId={documentId}
        documentType={documentType}
        justPromised={justPromised}
        onCaughtUp={caughtUp}
      >
        {(copy) => (
          <Suspense fallback={<LoadingRoom />}>
            {/* Another copy is another document to the editor, so the room starts over on it. */}
            <LoadedRoom
              key={copy.openId}
              copy={copy}
              problem={problem}
              onProblem={setProblem}
              notice={notice}
              onNotice={setNotice}
              onPromised={setJustPromised}
            />
          </Suspense>
        )}
      </PostCopyProvider>
    </Suspense>
  )
}

function LoadingRoom() {
  const router = useRouter()
  const backToLobby = useCallback(() => router.navigate({}), [router])
  useEscape(backToLobby)
  return (
    <>
      <RoomControls
        start={
          <QuietButton icon={ArrowLeftIcon} onClick={backToLobby}>
            Leave
          </QuietButton>
        }
      />
      <Page>
        <Placeholder $height="3.5rem" />
      </Page>
    </>
  )
}

const NOTICE_VISIBLE_MS = 8000
/** Long enough to reach for a notice that offers somewhere to go. */
const NOTICE_WITH_NEXT_STEP_MS = 16000

/** Typing that could never land: a letter, or a key that edits, pressed where the Prose is. */
function isTypingAtProse(event: KeyboardEvent): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey) return false
  if (event.key.length !== 1 && event.key !== 'Backspace' && event.key !== 'Delete' && event.key !== 'Enter') return false
  const target = event.target as HTMLElement | null
  if (!target || target.closest('[data-calm-floating], [data-calm-details], button, a, select')) return false
  if (target instanceof HTMLInputElement) return false
  return !(target instanceof HTMLTextAreaElement) || target.readOnly
}

function LoadedRoom({
  copy,
  problem,
  onProblem,
  notice,
  onNotice: setNotice,
  onPromised,
}: {
  copy: PostCopy
  problem: string | null
  onProblem: (problem: string | null) => void
  notice: RoomNotice | null
  onNotice: (notice: RoomNotice | null) => void
  onPromised: (promised: JustPromised) => void
}) {
  const {handle} = copy
  const scheme = useColorSchemeValue()
  const {fields, singular} = useWritingKind(handle.documentType)
  const schemaDefinition = useBodySchema(handle.documentType, fields.body)
  const {data} = useDocumentProjection<{_id: string; slug?: string}>({
    ...handle,
    projection: fields.slug ? `{_id, "slug": ${fields.slug}.current}` : '{_id}',
  })
  const status = describePostStatus(data?._status, {promise: copy.promise})
  const {isPublished, locked} = status
  const page = useRef<HTMLElement>(null)
  const receded = useRecede(page)
  const [settings] = useRoomSettings()
  const client = useClient({apiVersion: API_VERSION})
  const canSchedule = useCanSchedule(handle.documentId, handle.documentType)
  const openInStructure = useOpenInStructure(handle)

  // "Edit it": off the schedule, which makes it a Draft that remembers its time.
  const {releaseId} = copy
  const takeOff = useCallback(async () => {
    if (!releaseId) return
    try {
      await takeOffSchedule(scheduleClient(client), {releaseId})
      setNotice(null)
      onProblem(null)
    } catch {
      onProblem(`This ${singular} couldn’t be taken off the schedule just now. Try again in a moment.`)
    }
  }, [client, releaseId, singular, setNotice, onProblem])

  // A page that silently ignores keys reads as broken, so the room says why, where it speaks.
  const promisedFor = locked ? status.promisedFor : undefined
  useEffect(() => {
    if (!promisedFor) return undefined
    const say = (event: KeyboardEvent) => {
      if (!isTypingAtProse(event)) return
      setNotice({
        text: `This ${singular} is scheduled for ${describePromisedTime(promisedFor)}.`,
        action: {label: 'Edit it', onClick: () => void takeOff()},
      })
    }
    // Before anything in the room can take the key for itself.
    window.addEventListener('keydown', say, true)
    return () => window.removeEventListener('keydown', say, true)
  }, [promisedFor, singular, setNotice, takeOff])

  // The room never picks between two people's words: it says the others are there, once.
  const {otherChanges} = copy
  useEffect(() => {
    if (!otherChanges) return
    setNotice({
      text: `This ${singular} has other changes waiting in Structure.`,
      action: {label: 'Open in Structure', onClick: openInStructure},
    })
  }, [otherChanges, singular, setNotice, openInStructure])
  const projectId = useProjectId()
  const dataset = useDataset()

  // So the Lobby can offer to continue this one.
  useEffect(() => {
    rememberLastOpened(projectId, dataset, {documentId: handle.documentId, documentType: handle.documentType})
  }, [projectId, dataset, handle.documentId, handle.documentType])

  const view = useRoomView(handle)
  const {hasDetails, inDetails} = view

  const details = hasDetails ? (
    <QuietButton aria-pressed={inDetails} onClick={() => (inDetails ? view.toProse() : view.openDetails())}>
      Details
    </QuietButton>
  ) : null
  const preview = (
    <PreviewButton documentType={handle.documentType} slug={data?.slug} onProblem={onProblem} />
  )

  return (
    <EditorProvider initialConfig={{schemaDefinition}}>
      <RoomSyncProvider handle={handle} releaseId={copy.releaseId}>
        <Layout>
          {/* Leave on one side; status, Aa, Details, Preview and Publish on the other. Nothing else. */}
          <RoomControls
            // Nothing can be typed into a Scheduled Post, so its controls stay where they can be found.
            receded={receded && !inDetails && !locked}
            start={
              <Recedes>
                {inDetails ? (
                  <BackToProse onBack={view.toProse} />
                ) : (
                  <LeaveButton handle={handle} releaseId={copy.releaseId} isPublished={isPublished} />
                )}
              </Recedes>
            }
            end={
              <>
                <Presence handle={handle} />
                <SaveState />
                <Recedes>
                  <WideOnly>
                    <StatusLabel status={status} />
                  </WideOnly>
                  <RoomSettingsMenu
                    scheme={scheme}
                    more={
                      <>
                        {details}
                        {preview}
                      </>
                    }
                  />
                  <WideOnly>
                    {details}
                    {preview}
                  </WideOnly>
                  <PublishButton
                    copy={copy}
                    status={status}
                    scheme={scheme}
                    canSchedule={canSchedule}
                    onProblem={onProblem}
                    onNotice={setNotice}
                    onPromised={onPromised}
                    onTakeOff={takeOff}
                  />
                </Recedes>
              </>
            }
          />
          <Main>
            <Page as="article" ref={page} $textSize={settings.textSize}>
              <Title handle={handle} fields={fields} isPublished={isPublished} locked={locked} inDetails={inDetails} />
              <Pages
                handle={handle}
                releaseId={copy.releaseId}
                locked={locked}
                fields={fields}
                scheme={scheme}
                page={page}
                inDetails={inDetails}
                focusField={view.field}
                onProblem={onProblem}
              />
            </Page>
          </Main>
          <Foot>
            <Count data-receded={receded && !inDetails && !locked}>
              <WordCount />
            </Count>
            <Messages>
              <RoomMessage
                problem={problem}
                onDismissProblem={() => onProblem(null)}
                notice={notice}
              />
            </Messages>
          </Foot>
        </Layout>
      </RoomSyncProvider>
    </EditorProvider>
  )
}

function Title({
  handle,
  fields,
  isPublished,
  locked,
  inDetails,
}: {
  handle: DocumentHandle
  fields: WritingFields
  isPublished: boolean
  locked: boolean
  inDetails: boolean
}) {
  const editor = useEditor()
  // Enter goes on to whatever is under the title: the body, or the first of the Details.
  const onEnter = useCallback(() => {
    if (inDetails) askForFirstDetail()
    else editor.send({type: 'focus'})
  }, [editor, inDetails])
  return <TitleField handle={handle} fields={fields} isPublished={isPublished} readOnly={locked} onEnter={onEnter} />
}

/** The body and Details take turns under the title. The editor stays mounted, so the caret keeps its place. */
function Pages({
  handle,
  releaseId,
  locked,
  fields,
  scheme,
  page,
  inDetails,
  focusField,
  onProblem,
}: {
  handle: DocumentHandle
  releaseId: string | null
  locked: boolean
  fields: WritingFields
  scheme: string
  page: RefObject<HTMLElement | null>
  inDetails: boolean
  focusField: string | undefined
  onProblem: (problem: string | null) => void
}) {
  const editor = useEditor()
  const openInStructure = useOpenInStructure(handle)
  const backToCaret = useCallback(() => {
    if (editor.getSnapshot().context.selection) editor.send({type: 'focus'})
  }, [editor])
  const {shown, leaving, entering} = useSwap(inDetails ? 'details' : 'prose', page, backToCaret)

  return (
    <>
      {/* Inert as soon as it starts to go, so nothing typed lands in an editor that can't be seen. */}
      <Swap hidden={shown !== 'prose'} inert={inDetails} data-leaving={leaving} data-entering={entering}>
        <BodyEditor handle={handle} path={fields.body} scheme={scheme} readOnly={locked} onProblem={onProblem} />
      </Swap>
      {shown === 'details' && (
        <Swap inert={leaving} data-leaving={leaving} data-entering={entering} data-rises="">
          <DetailsBoundary onOpenInStructure={openInStructure}>
            <Suspense fallback={<Placeholder $height="12rem" />}>
              <DetailsView
                handle={handle}
                fields={fields}
                focusField={focusField}
                releaseId={releaseId ?? undefined}
                readOnly={locked}
              />
            </Suspense>
          </DetailsBoundary>
        </Swap>
      )}
    </>
  )
}

/** Returns to wherever the Writer came from; a never-published, empty document is discarded on the way out. */
function LeaveButton({
  handle,
  releaseId,
  isPublished,
}: {
  handle: DocumentHandle
  releaseId: string | null
  isPublished: boolean
}) {
  const router = useRouter()
  const {data: post} = useDocument<Record<string, unknown>>(handle)
  // Details saves through the Studio's store, so what was just typed there is in its draft first.
  const {draft: detailsDraft} = useEditState(handle.documentId, handle.documentType, 'default', releaseId ?? undefined)
  const {fields} = useWritingKind(handle.documentType)
  const apply = useApplyDocumentActions()
  const openInStructure = useOpenInStructure(handle)
  const toForm = didComeFromForm(handle.documentId)

  const leave = useCallback(() => {
    // Only ever a draft: a Post with a promised time is not an abandoned start.
    if (!releaseId && !isPublished && isEmptyPost(post, fields) && isEmptyPost(detailsDraft, fields)) {
      void apply(discardDocument(handle))
      router.navigate({})
    } else if (toForm) {
      openInStructure()
    } else {
      router.navigate({})
    }
  }, [apply, handle, releaseId, isPublished, post, detailsDraft, fields, router, toForm, openInStructure])
  useEscape(leave)

  const label = toForm ? 'Back to the form' : 'Back to the Lobby'
  return (
    <QuietButton icon={ArrowLeftIcon} aria-label={label} title={label} onClick={leave}>
      <WideOnly>Leave</WideOnly>
    </QuietButton>
  )
}

/** One step out: from Details, the arrow and Escape return to the Prose. */
function BackToProse({onBack}: {onBack: () => void}) {
  useEscape(onBack)
  return (
    <QuietButton icon={ArrowLeftIcon} aria-label="Back to writing" title="Back to writing" onClick={onBack}>
      <WideOnly>Back</WideOnly>
    </QuietButton>
  )
}

const fadeIn = keyframes`
  from {
    opacity: 0;
  }
`

const rise = keyframes`
  from {
    opacity: 0;
    transform: translateY(4px);
  }
`

/** Out over `press`, then in over `gentle`; Details rises 4px as it arrives. Instant under reduced motion. */
const Swap = styled.div`
  &[hidden] {
    display: none;
  }

  @media (prefers-reduced-motion: no-preference) {
    transition: opacity var(--calm-motion-press) var(--calm-motion-easing);

    &[data-leaving='true'] {
      opacity: 0;
    }

    &[data-entering='true'] {
      animation: ${fadeIn} var(--calm-motion-gentle) var(--calm-motion-easing) both;
    }

    &[data-entering='true'][data-rises] {
      animation-name: ${rise};
    }
  }
`

const Page = styled(Column)<{$textSize?: 'small' | 'medium' | 'large'}>`
  font-family: var(--calm-font-prose);
  font-size: ${({$textSize = 'medium'}) => `var(--calm-prose-size-${$textSize})`};
  font-weight: var(--calm-weight-prose);
  line-height: var(--calm-type-prose-leading);
`

/** The room from top to bottom: Room Controls, the page, and a foot that stays in view. */
const Layout = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 100%;
`

const Main = styled.div`
  flex: 1;
`

/**
 * The foot of the room: the word count in the margin, and the room's one message slot in the
 * middle. Clicks pass through everywhere but the message.
 */
const Foot = styled.footer`
  position: sticky;
  bottom: 0;
  display: grid;
  grid-template-columns: 1fr minmax(0, auto) 1fr;
  align-items: end;
  gap: var(--calm-space-md);
  padding: var(--calm-space-md) var(--calm-space-lg);
  pointer-events: none;

  ${NO_MARGIN} {
    grid-template-columns: minmax(0, 1fr);
  }

  ${NARROW} {
    padding-inline: var(--calm-space-sm);
  }
`

/** Recedes with the Room Controls. Without a margin to sit in, it's in the `Aa` menu instead. */
const Count = styled.div`
  transition: opacity var(--calm-motion-recede) var(--calm-motion-easing);

  &[data-receded='true'] {
    opacity: 0.08;
  }

  ${NO_MARGIN} {
    display: none;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`

const Messages = styled.div`
  display: flex;
  justify-content: center;
  min-width: 0;

  & > * {
    pointer-events: auto;
  }
`
