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
  codeFenceRule,
  exitStyleOnEmptyEnter,
  imageFileBehaviors,
  pasteLinkAsEmbed,
  pickImageBehavior,
} from './behaviors'
import {type BodyAllows, bodyAllows} from './allows'
import {InsertMenu} from './InsertMenu'
import {LinkPopover} from './LinkPopover'
import {bodyNodes} from './nodes'
import {RoomDocumentContext} from './room-document'
import {SelectionBubble} from './SelectionBubble'

const inputRules = [codeFenceRule]

/** `---` makes a section break, under whichever name this body has it. */
function sectionBreakFor(context: {schema: EditorSchema}) {
  const type = bodyAllows(context.schema).roomBlock('sectionBreak')
  return type ? {_type: type, kind: 'break'} : undefined
}

/** `value` when the body type allows it, for the markdown shortcuts. */
function allowed<T>(
  context: {schema: EditorSchema},
  test: (allows: BodyAllows) => boolean,
  value: T,
): T | undefined {
  return test(bodyAllows(context.schema)) ? value : undefined
}

/** The body of a document, synced live with the Content Lake. Must sit inside an `EditorProvider`. */
export function BodyEditor({
  handle,
  path,
  scheme,
  onUploadFailed,
}: {
  handle: DocumentHandle
  /** The document's portable text field. */
  path: string
  scheme: string
  onUploadFailed: (message: string) => void
}) {
  const editor = useEditor()
  const [focused, setFocused] = useState(false)
  const upload = useImageUpload(onUploadFailed)
  const fileInput = useRef<HTMLInputElement>(null)

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
  const behaviors = useMemo(
    () => [
      exitStyleOnEmptyEnter,
      pasteLinkAsEmbed,
      ...imageFileBehaviors(upload),
      pickImageBehavior(pickImage),
    ],
    [upload, pickImage],
  )

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
      <InsertMenu scheme={scheme} editorFocused={focused} />
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

/**
 * Typewriter scrolling: keeps the line being written at the same height (40% down the room),
 * so the Writer's eyes don't drift to the bottom of the screen.
 */
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

/**
 * Places each image in the body straight away (a soft shimmer while it uploads), then fills in
 * the uploaded asset. If an upload fails, the placeholder is removed and the Writer is told.
 */
function useImageUpload(onUploadFailed: (message: string) => void) {
  const editor = useEditor()
  const client = useClient({apiVersion: API_VERSION})

  return useCallback(
    (files: File[]) => {
      for (const file of files) {
        editor.send({type: 'focus'})
        editor.send({type: 'insert.block', block: {_type: 'image'}, placement: 'auto', select: 'start'})
        const placed = getFocusBlock(editor.getSnapshot())
        if (!placed || placed.node._type !== 'image') continue
        const at = placed.path

        client.assets
          .upload('image', file, {filename: file.name})
          .then((asset) => {
            editor.send({
              type: 'block.set',
              at,
              props: {asset: {_type: 'reference', _ref: asset._id}},
            })
          })
          .catch(() => {
            editor.send({type: 'delete.block', at})
            onUploadFailed(`“${file.name}” couldn’t be uploaded. Try again in a moment.`)
          })
      }
    },
    [editor, client, onUploadFailed],
  )
}

const Placeholder = styled.span`
  color: var(--calm-color-ink-muted);
`

/** The body's typography. Every value comes from the shared tokens; see DESIGN.md. */
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

  /* Lists: each item is its own block, so markers and numbering are drawn here. */
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

  :not([data-list-item='number']) + [data-list-item='number'][data-level='1'] {
    counter-reset: calm-l1 calm-l2;
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
