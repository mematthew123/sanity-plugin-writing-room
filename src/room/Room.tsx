import {EditorProvider, useEditor} from '@portabletext/editor'
import {ArrowLeftIcon} from '@sanity/icons/ArrowLeft'
import {
  discardDocument,
  type DocumentHandle,
  useApplyDocumentActions,
  useDocument,
  useDocumentProjection,
} from '@sanity/sdk-react'
import {type RefObject, Suspense, useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {useColorSchemeValue, useDataset, useEditState, useProjectId} from 'sanity'
import {useRouter} from 'sanity/router'
import styled, {keyframes} from 'styled-components'
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
import {TitleField} from './TitleField'
import {useEscape} from './use-escape'
import {useRecede} from './use-recede'

export function Room({documentId, documentType}: {documentId: string; documentType: string}) {
  const handle = useMemo<DocumentHandle>(() => ({documentId, documentType}), [documentId, documentType])
  const [problem, setProblem] = useState<string | null>(null)

  return (
    <Suspense fallback={<LoadingRoom />}>
      <LoadedRoom handle={handle} problem={problem} onProblem={setProblem} />
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

function LoadedRoom({
  handle,
  problem,
  onProblem,
}: {
  handle: DocumentHandle
  problem: string | null
  onProblem: (problem: string | null) => void
}) {
  const scheme = useColorSchemeValue()
  const {fields} = useWritingKind(handle.documentType)
  const schemaDefinition = useBodySchema(handle.documentType, fields.body)
  const {data} = useDocumentProjection<{_id: string; slug?: string}>({
    ...handle,
    projection: fields.slug ? `{_id, "slug": ${fields.slug}.current}` : '{_id}',
  })
  const status = describePostStatus(data?._status)
  const isPublished = status.label !== 'Draft'
  const page = useRef<HTMLElement>(null)
  const receded = useRecede(page)
  const [notice, setNotice] = useState<RoomNotice | null>(null)
  const [settings] = useRoomSettings()
  const projectId = useProjectId()
  const dataset = useDataset()

  // So the Lobby can offer to continue this one.
  useEffect(() => {
    rememberLastOpened(projectId, dataset, {documentId: handle.documentId, documentType: handle.documentType})
  }, [projectId, dataset, handle.documentId, handle.documentType])

  useEffect(() => {
    if (!notice) return undefined
    const visibleFor = notice.link || notice.action ? NOTICE_WITH_NEXT_STEP_MS : NOTICE_VISIBLE_MS
    const timer = setTimeout(() => setNotice(null), visibleFor)
    return () => clearTimeout(timer)
  }, [notice])

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
      <RoomSyncProvider handle={handle}>
        <Layout>
          {/* Leave on one side; status, Aa, Details, Preview and Publish on the other. Nothing else. */}
          <RoomControls
            receded={receded && !inDetails}
            start={
              <Recedes>
                {inDetails ? (
                  <BackToProse onBack={view.toProse} />
                ) : (
                  <LeaveButton handle={handle} isPublished={isPublished} />
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
                    handle={handle}
                    status={status}
                    scheme={scheme}
                    onProblem={onProblem}
                    onNotice={setNotice}
                  />
                </Recedes>
              </>
            }
          />
          <Main>
            <Page as="article" ref={page} $textSize={settings.textSize}>
              <Title handle={handle} fields={fields} isPublished={isPublished} inDetails={inDetails} />
              <Pages
                handle={handle}
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
            <Count data-receded={receded && !inDetails}>
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
  inDetails,
}: {
  handle: DocumentHandle
  fields: WritingFields
  isPublished: boolean
  inDetails: boolean
}) {
  const editor = useEditor()
  // Enter goes on to whatever is under the title: the body, or the first of the Details.
  const onEnter = useCallback(() => {
    if (inDetails) askForFirstDetail()
    else editor.send({type: 'focus'})
  }, [editor, inDetails])
  return <TitleField handle={handle} fields={fields} isPublished={isPublished} onEnter={onEnter} />
}

/** The body and Details take turns under the title. The editor stays mounted, so the caret keeps its place. */
function Pages({
  handle,
  fields,
  scheme,
  page,
  inDetails,
  focusField,
  onProblem,
}: {
  handle: DocumentHandle
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
        <BodyEditor handle={handle} path={fields.body} scheme={scheme} onProblem={onProblem} />
      </Swap>
      {shown === 'details' && (
        <Swap inert={leaving} data-leaving={leaving} data-entering={entering} data-rises="">
          <DetailsBoundary onOpenInStructure={openInStructure}>
            <Suspense fallback={<Placeholder $height="12rem" />}>
              <DetailsView handle={handle} fields={fields} focusField={focusField} />
            </Suspense>
          </DetailsBoundary>
        </Swap>
      )}
    </>
  )
}

/** Returns to wherever the Writer came from; a never-published, empty document is discarded on the way out. */
function LeaveButton({handle, isPublished}: {handle: DocumentHandle; isPublished: boolean}) {
  const router = useRouter()
  const {data: post} = useDocument<Record<string, unknown>>(handle)
  // Details saves through the Studio's store, so what was just typed there is in its draft first.
  const {draft: detailsDraft} = useEditState(handle.documentId, handle.documentType)
  const {fields} = useWritingKind(handle.documentType)
  const apply = useApplyDocumentActions()
  const openInStructure = useOpenInStructure(handle)
  const toForm = didComeFromForm(handle.documentId)

  const leave = useCallback(() => {
    if (!isPublished && isEmptyPost(post, fields) && isEmptyPost(detailsDraft, fields)) {
      void apply(discardDocument(handle))
      router.navigate({})
    } else if (toForm) {
      openInStructure()
    } else {
      router.navigate({})
    }
  }, [apply, handle, isPublished, post, detailsDraft, fields, router, toForm, openInStructure])
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
