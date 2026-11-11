import {EditorProvider, useEditor} from '@portabletext/editor'
import {ArrowLeftIcon} from '@sanity/icons/ArrowLeft'
import {
  discardDocument,
  type DocumentHandle,
  useApplyDocumentActions,
  useDocument,
  useDocumentProjection,
} from '@sanity/sdk-react'
import {Suspense, useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {useColorSchemeValue} from 'sanity'
import {useRouter} from 'sanity/router'
import styled from 'styled-components'
import {BodyEditor} from './editor/BodyEditor'
import {useBodySchema} from './editor/schema'
import {useWritingKind} from './kinds'
import {isEmptyPost} from './empty-post'
import {type WritingFields} from './fields'
import {useOpenDetails} from './navigation'
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
  SaveState,
  StatusLabel,
} from './room-status'
import {useRoomSettings} from './room-settings'
import {TitleField} from './TitleField'
import {useEscape} from './use-escape'
import {useRecede} from './use-recede'

/** The Writing Room for one document: a Post, or any other of the room's types. */
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

  useEffect(() => {
    if (!notice) return undefined
    const visibleFor = notice.link || notice.action ? NOTICE_WITH_NEXT_STEP_MS : NOTICE_VISIBLE_MS
    const timer = setTimeout(() => setNotice(null), visibleFor)
    return () => clearTimeout(timer)
  }, [notice])

  const details = <DetailsButton handle={handle} />
  const preview = (
    <PreviewButton documentType={handle.documentType} slug={data?.slug} onProblem={onProblem} />
  )

  return (
    <EditorProvider initialConfig={{schemaDefinition}}>
      <Layout>
        {/* Leave on one side; status, Aa, Details, Preview and Publish on the other. Nothing else. */}
        <RoomControls
          receded={receded}
          start={
            <Recedes>
              <LeaveButton handle={handle} isPublished={isPublished} />
            </Recedes>
          }
          end={
            <>
              <Presence handle={handle} />
              <SaveState handle={handle} />
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
            <Title handle={handle} fields={fields} isPublished={isPublished} />
            <BodyEditor handle={handle} path={fields.body} scheme={scheme} onUploadFailed={onProblem} />
          </Page>
        </Main>
        <Foot>
          <Count data-receded={receded}>
            <WordCount />
          </Count>
          <Messages>
            <RoomMessage
              handle={handle}
              problem={problem}
              onDismissProblem={() => onProblem(null)}
              notice={notice}
            />
          </Messages>
        </Foot>
      </Layout>
    </EditorProvider>
  )
}

/** Enter in the title carries the Writer into the body. */
function Title({
  handle,
  fields,
  isPublished,
}: {
  handle: DocumentHandle
  fields: WritingFields
  isPublished: boolean
}) {
  const editor = useEditor()
  return (
    <TitleField
      handle={handle}
      fields={fields}
      isPublished={isPublished}
      onEnter={() => editor.send({type: 'focus'})}
    />
  )
}

/**
 * Leave (or Esc) returns to the Lobby. A document that was never published and is still completely
 * empty (Prose and Details alike) is discarded on the way out, so an abandoned "Start a new Post"
 * leaves nothing behind.
 */
function LeaveButton({handle, isPublished}: {handle: DocumentHandle; isPublished: boolean}) {
  const router = useRouter()
  const {data: post} = useDocument<Record<string, unknown>>(handle)
  const {fields} = useWritingKind(handle.documentType)
  const apply = useApplyDocumentActions()

  const leave = useCallback(() => {
    if (!isPublished && isEmptyPost(post, fields)) void apply(discardDocument(handle))
    router.navigate({})
  }, [apply, handle, isPublished, post, fields, router])
  useEscape(leave)

  return (
    <QuietButton icon={ArrowLeftIcon} aria-label="Leave" onClick={leave}>
      <WideOnly>Leave</WideOnly>
    </QuietButton>
  )
}

function DetailsButton({handle}: {handle: DocumentHandle}) {
  const openDetails = useOpenDetails(handle)
  return <QuietButton onClick={openDetails}>Details</QuietButton>
}

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
