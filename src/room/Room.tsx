import {EditorProvider, useEditor} from '@portabletext/editor'
import {ArrowLeftIcon} from '@sanity/icons/ArrowLeft'
import {CloseIcon} from '@sanity/icons/Close'
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
import {isEmptyPost} from './empty-post'
import {useOpenDetails} from './navigation'
import {FullscreenToggle, RoomSettingsMenu, WordCount} from './comfort'
import {describePostStatus} from './post-status'
import {PreviewButton} from './PreviewButton'
import {Column, Placeholder, QuietButton, Recedes, RoomControls} from './primitives'
import {
  Presence,
  PublishButton,
  type RoomNotice,
  SaveState,
  StatusLabel,
  ThemeToggle,
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
  const schemaDefinition = useBodySchema()
  const {data} = useDocumentProjection<{_id: string; slug?: string}>({
    ...handle,
    projection: '{_id, "slug": slug.current}',
  })
  const status = describePostStatus(data?._status)
  const isPublished = status.label !== 'Draft'
  const page = useRef<HTMLElement>(null)
  const receded = useRecede(page)
  const [notice, setNotice] = useState<RoomNotice | null>(null)
  const [settings] = useRoomSettings()

  useEffect(() => {
    if (!notice) return undefined
    const timer = setTimeout(() => setNotice(null), NOTICE_VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [notice])

  return (
    <EditorProvider initialConfig={{schemaDefinition}}>
      <RoomControls
        receded={receded}
        start={
          <Recedes>
            <LeaveButton handle={handle} isPublished={isPublished} />
            <FullscreenToggle />
          </Recedes>
        }
        end={
          <>
            {problem && (
              <Problem role="alert">
                {problem}
                <QuietButton icon={CloseIcon} aria-label="Dismiss" onClick={() => onProblem(null)} />
              </Problem>
            )}
            <Presence handle={handle} />
            <SaveState handle={handle} />
            <Recedes>
              {notice ? (
                <Notice role="status">
                  {notice.text}
                  {notice.action && (
                    <QuietButton onClick={notice.action.onClick}>{notice.action.label}</QuietButton>
                  )}
                </Notice>
              ) : (
                <>
                  <WordCount />
                  <StatusLabel status={status} />
                </>
              )}
              <RoomSettingsMenu scheme={scheme} />
              <ThemeToggle />
              <DetailsButton handle={handle} />
              <PreviewButton
                documentType={handle.documentType}
                slug={data?.slug}
                onProblem={onProblem}
              />
              <PublishButton
                handle={handle}
                status={status}
                onProblem={onProblem}
                onNotice={setNotice}
              />
            </Recedes>
          </>
        }
      />
      <Page as="article" ref={page} $textSize={settings.textSize}>
        <Title handle={handle} isPublished={isPublished} />
        <BodyEditor handle={handle} scheme={scheme} onUploadFailed={onProblem} />
      </Page>
    </EditorProvider>
  )
}

/** Enter in the title carries the Writer into the body. */
function Title({handle, isPublished}: {handle: DocumentHandle; isPublished: boolean}) {
  const editor = useEditor()
  return (
    <TitleField
      handle={handle}
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
  const apply = useApplyDocumentActions()

  const leave = useCallback(() => {
    if (!isPublished && isEmptyPost(post)) void apply(discardDocument(handle))
    router.navigate({})
  }, [apply, handle, isPublished, post, router])
  useEscape(leave)

  return (
    <QuietButton icon={ArrowLeftIcon} onClick={leave}>
      Leave
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

const Notice = styled.span`
  display: flex;
  align-items: center;
  gap: var(--calm-space-xs);
  color: var(--calm-color-ink-muted);
  font-size: var(--calm-type-ui-size-small);
`

const Problem = styled.p`
  display: flex;
  align-items: center;
  gap: var(--calm-space-xs);
  margin: 0;
  color: var(--calm-color-caution);
  font-size: var(--calm-type-ui-size-small);

  button {
    min-height: 1.75rem;
    padding: var(--calm-space-xs);
    color: inherit;
  }
`
