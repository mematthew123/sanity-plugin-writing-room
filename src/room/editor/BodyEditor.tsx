import {type EditorSchema, useEditor} from '@portabletext/editor'
import {getFocusBlock} from '@portabletext/editor/selectors'
import {useEditorSelector} from '@portabletext/editor'
import {BehaviorPlugin, NodePlugin} from '@portabletext/editor/plugins'
import {InputRulePlugin} from '@portabletext/plugin-input-rule'
import {MarkdownShortcutsPlugin} from '@portabletext/plugin-markdown-shortcuts'
import {PasteLinkPlugin} from '@portabletext/plugin-paste-link'
import {SDKPortableTextEditable} from '@portabletext/plugin-sdk-value'
import {type DocumentHandle} from '@sanity/sdk-react'
import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {useClient} from 'sanity'
import styled from 'styled-components'
import {API_VERSION} from '../../lib/api-version'
import {useRoomSettings} from '../room-settings'
import {
  chooseImageBehavior,
  codeFenceRule,
  exitStyleOnEmptyEnter,
  imageFileBehaviors,
  pasteLinkAsEmbed,
  pickImageBehavior,
} from './behaviors'
import {type BodyAllows, bodyAllows} from './allows'
import {type AssetFromSource, type AssetSource} from 'sanity'
import {type ChosenImage, chosenImage, useBodyImages} from './image-sources'
import {ImageSourceDialog} from './ImageSourceDialog'
import {InsertMenu} from './InsertMenu'
import {LinkPopover} from './LinkPopover'
import {bodyNodes} from './nodes'
import {RoomDocumentContext} from './room-document'
import {SelectionBubble} from './SelectionBubble'

const inputRules = [codeFenceRule]

/** What `---` inserts, if this body has a section break. */
function sectionBreakFor(context: {schema: EditorSchema}) {
  const type = bodyAllows(context.schema).roomBlock('sectionBreak')
  return type ? {_type: type, kind: 'break'} : undefined
}

function allowed<T>(
  context: {schema: EditorSchema},
  test: (allows: BodyAllows) => boolean,
  value: T,
): T | undefined {
  return test(bodyAllows(context.schema)) ? value : undefined
}

/** Must sit inside an `EditorProvider`. */
export function BodyEditor({
  handle,
  path,
  scheme,
  onProblem,
}: {
  handle: DocumentHandle
  path: string
  scheme: string
  onProblem: (message: string) => void
}) {
  const editor = useEditor()
  const [focused, setFocused] = useState(false)
  const images = useBodyImages(handle.documentType, path)
  const {upload, place} = useImageInsert(onProblem)
  const fileInput = useRef<HTMLInputElement>(null)
  // 'sources' while the Writer is picking which image source to open, then the one that is open.
  const [choosing, setChoosing] = useState<'sources' | AssetSource | null>(null)

  useEffect(() => {
    const subscriptions = [
      editor.on('focused', () => setFocused(true)),
      editor.on('blurred', () => setFocused(false)),
    ]
    return () => subscriptions.forEach((subscription) => subscription.unsubscribe())
  }, [editor])

  const [settings] = useRoomSettings()
  useTypewriterScrolling(settings.typewriter && focused)
  const focusKey = useEditorSelector(editor, (snapshot) => getFocusBlock(snapshot)?.node._key)
  const dimming = settings.focusDimming && focused && focusKey

  const schema = useEditorSelector(editor, (snapshot) => snapshot.context.schema)
  const nodes = useMemo(() => bodyNodes(schema), [schema])
  const roomDocument = useMemo(() => ({handle, bodyField: path}), [handle, path])
  const pickImage = useCallback(() => fileInput.current?.click(), [])
  const {sources} = images
  const chooseImage = useCallback(
    () => setChoosing(sources.length === 1 ? sources[0]! : sources.length > 1 ? 'sources' : null),
    [sources],
  )
  const behaviors = useMemo(
    () => [
      exitStyleOnEmptyEnter,
      pasteLinkAsEmbed,
      // A Studio that has turned uploads off means it for a paste and a drop too.
      ...(images.upload ? imageFileBehaviors(upload) : []),
      pickImageBehavior(pickImage),
      chooseImageBehavior(chooseImage),
    ],
    [images.upload, upload, pickImage, chooseImage],
  )

  const backToLine = useCallback(() => {
    setChoosing(null)
    editor.send({type: 'focus'})
  }, [editor])
  const onChosen = useCallback(
    (chosen: AssetFromSource[]) => {
      setChoosing(null)
      const first = chosen[0]
      if (first) place(() => chosenImage(first), 'That image couldn’t be added just now. Trying again is fine.')
      else editor.send({type: 'focus'})
    },
    [editor, place],
  )
  const onSourceFailed = useCallback(() => {
    backToLine()
    onProblem('Images couldn’t be opened just now. Trying again is fine.')
  }, [backToLine, onProblem])

  return (
    <RoomDocumentContext.Provider value={roomDocument}>
      <NodePlugin nodes={nodes} />
      {/* Mounted before PasteLinkPlugin so pasted Embed links win over plain links. */}
      <BehaviorPlugin behaviors={behaviors} />
      <InputRulePlugin rules={inputRules} />
      {/* Each shortcut does nothing when the body type can't store what it makes. */}
      <MarkdownShortcutsPlugin
        defaultStyle={({context}) => allowed(context, (a) => a.style('normal'), 'normal')}
        headingStyle={({context, props}) => {
          const style = props.level === 2 ? 'h2' : props.level === 3 ? 'h3' : undefined
          return style && allowed(context, (a) => a.style(style), style)
        }}
        blockquoteStyle={({context}) => allowed(context, (a) => a.style('blockquote'), 'blockquote')}
        unorderedList={({context}) => allowed(context, (a) => a.list('bullet'), 'bullet')}
        orderedList={({context}) => allowed(context, (a) => a.list('number'), 'number')}
        boldDecorator={({context}) => allowed(context, (a) => a.decorator('strong'), 'strong')}
        italicDecorator={({context}) => allowed(context, (a) => a.decorator('em'), 'em')}
        horizontalRuleObject={({context}) =>
          sectionBreakFor(context)
        }
        linkObject={({context, props}) => allowed(context, (a) => a.annotation('link'), {_type: 'link', href: props.href})}
      />
      <PasteLinkPlugin />
      {dimming && (
        <style>{`[data-pt-editor] [data-calm-block]:not([data-calm-block="${CSS.escape(focusKey)}"]) { opacity: 0.35; }`}</style>
      )}
      <Prose
        {...handle}
        path={path}
        renderCursor={null}
        spellCheck
        aria-label="Body"
        renderPlaceholder={() => <Placeholder>Start writing…</Placeholder>}
      />
      <SelectionBubble scheme={scheme} editorFocused={focused} />
      <LinkPopover scheme={scheme} editorFocused={focused} />
      <InsertMenu
        scheme={scheme}
        editorFocused={focused}
        images={images}
        choosingSource={choosing === 'sources'}
        // Backing out of the list never closes a source that has since opened.
        onChooseSource={(source) => setChoosing((current) => (current === 'sources' ? source : current))}
      />
      {choosing && choosing !== 'sources' && (
        <ImageSourceDialog
          source={choosing}
          type={images.type}
          onSelect={onChosen}
          onClose={backToLine}
          onFailed={onSourceFailed}
        />
      )}
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? [])
          event.currentTarget.value = ''
          if (files.length > 0) upload(files)
        }}
      />
    </RoomDocumentContext.Provider>
  )
}

const TYPEWRITER_LINE = 0.4

/** Keeps the line being written 40% down the room. */
function useTypewriterScrolling(enabled: boolean) {
  const editor = useEditor()
  useEffect(() => {
    if (!enabled) return undefined
    const keepLineInPlace = () => {
      const caret = editor.dom.getSelectionRect(editor.getSnapshot())
      const surface = editor.dom.getEditorElement?.()?.closest('[data-calm-surface]')
      if (!caret || !surface) return
      const target = surface.getBoundingClientRect().top + surface.clientHeight * TYPEWRITER_LINE
      surface.scrollBy({top: caret.top - target})
    }
    const subscriptions = [editor.on('selection', keepLineInPlace), editor.on('mutation', keepLineInPlace)]
    keepLineInPlace()
    return () => subscriptions.forEach((subscription) => subscription.unsubscribe())
  }, [editor, enabled])
}

/** However an image arrives, it holds its place at once, fills in when it's ready, and goes if it can't be had. */
function useImageInsert(onProblem: (message: string) => void) {
  const editor = useEditor()
  const client = useClient({apiVersion: API_VERSION})

  const place = useCallback(
    (image: () => ChosenImage, failed: string) => {
      let chosen: ChosenImage
      try {
        chosen = image()
      } catch {
        editor.send({type: 'focus'})
        onProblem(failed)
        return
      }
      editor.send({type: 'focus'})
      editor.send({
        type: 'insert.block',
        block: {_type: 'image', ...(chosen.kind === 'block' && chosen.props)},
        placement: 'auto',
        select: 'start',
      })
      if (chosen.kind === 'block') return
      const placed = getFocusBlock(editor.getSnapshot())
      if (!placed || placed.node._type !== 'image') return
      const at = placed.path
      const {file, options} = chosen

      file()
        .then((ready) => client.assets.upload('image', ready, options))
        .then((asset) => {
          editor.send({
            type: 'block.set',
            at,
            props: {asset: {_type: 'reference', _ref: asset._id}},
          })
        })
        .catch(() => {
          editor.send({type: 'delete.block', at})
          onProblem(failed)
        })
    },
    [editor, client, onProblem],
  )

  const upload = useCallback(
    (files: File[]) => {
      for (const file of files) {
        place(
          () => ({kind: 'file', file: () => Promise.resolve(file), options: {filename: file.name}}),
          `“${file.name}” couldn’t be uploaded. Try again in a moment.`,
        )
      }
    },
    [place],
  )

  return {upload, place}
}

const Placeholder = styled.span`
  color: var(--calm-color-ink-muted);
`

const Prose = styled(SDKPortableTextEditable)`
  min-height: 40vh;
  outline: none;
  caret-color: var(--calm-color-accent);
  text-wrap: pretty;
  counter-reset: calm-l1 calm-l2;

  & > * {
    margin-block: 0 var(--calm-type-prose-gap);
  }

  [data-calm-block] {
    transition: opacity var(--calm-motion-recede) var(--calm-motion-easing);
  }

  @media (prefers-reduced-motion: reduce) {
    [data-calm-block] {
      transition: none;
    }
  }

  h2,
  h3 {
    margin-top: calc(var(--calm-type-prose-gap) * 2);
    font-weight: var(--calm-weight-heading);
    line-height: var(--calm-type-heading-leading);
    text-wrap: balance;
  }

  h2 {
    font-size: var(--calm-type-heading);
  }

  h3 {
    font-size: var(--calm-type-subheading);
  }

  blockquote {
    margin-inline: 0;
    padding-inline-start: var(--calm-space-md);
    border-inline-start: 2px solid var(--calm-color-accent);
    color: var(--calm-color-ink-muted);
  }

  strong {
    font-weight: var(--calm-weight-heading);
  }

  [data-link] {
    color: var(--calm-color-accent);
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 0.2em;
  }

  /* Each list item is its own block, so markers and numbering are drawn here. */
  [data-list-item] {
    position: relative;
    margin-bottom: calc(var(--calm-type-prose-gap) * 0.4);
    padding-inline-start: 1.5em;
  }

  [data-list-item][data-level='2'] {
    margin-inline-start: 1.5em;
  }

  [data-list-item]::before {
    position: absolute;
    left: 0;
    color: var(--calm-color-ink-muted);
  }

  [data-list-item='bullet']::before {
    content: '•';
  }

  [data-list-item='bullet'][data-level='2']::before {
    content: '◦';
  }

  /* Set, not reset: a reset here starts a counter the items after this one don't count on ("1, 1, 2"). */
  :not([data-list-item='number']) + [data-list-item='number'][data-level='1'] {
    counter-set: calm-l1 1;
  }

  [data-list-item='number'][data-level='1'] {
    counter-increment: calm-l1;
    counter-reset: calm-l2;
  }

  [data-list-item='number'][data-level='1']::before {
    content: counter(calm-l1) '.';
  }

  [data-list-item='number'][data-level='2'] {
    counter-increment: calm-l2;
  }

  [data-list-item='number'][data-level='2']::before {
    content: counter(calm-l2, lower-alpha) '.';
  }

  [data-list-item] + :not([data-list-item]) {
    margin-top: calc(var(--calm-type-prose-gap) * 0.6);
  }
`
