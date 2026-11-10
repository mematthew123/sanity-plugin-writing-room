import {useEditor, useEditorSelector} from '@portabletext/editor'
import {
  getFocusBlockObject,
  isActiveAnnotation,
  isActiveDecorator,
  isActiveStyle,
  isSelectionExpanded,
} from '@portabletext/editor/selectors'
import {BoldIcon} from '@sanity/icons/Bold'
import {ItalicIcon} from '@sanity/icons/Italic'
import {LinkIcon} from '@sanity/icons/Link'
import {UnlinkIcon} from '@sanity/icons/Unlink'
import {
  type ComponentType,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import styled from 'styled-components'
import {useBodyAllows} from './allows'
import {Floating, FloatingSurface, useViewportChanges} from './floating'
import {normalizeHref} from './link'

/**
 * Formatting for selected text: a soft pill that appears above the selection. Alt+F10 moves
 * keyboard focus into it (it's portaled, so Tab never reaches it); Esc returns to the text.
 */
export function SelectionBubble({scheme, editorFocused}: {scheme: string; editorFocused: boolean}) {
  const editor = useEditor()
  const expanded = useEditorSelector(editor, isSelectionExpanded)
  const onBlockObject = useEditorSelector(editor, (snapshot) => !!getFocusBlockObject(snapshot))
  const selection = useEditorSelector(editor, (snapshot) => snapshot.context.selection)
  const bold = useEditorSelector(editor, isActiveDecorator('strong'))
  const italic = useEditorSelector(editor, isActiveDecorator('em'))
  const heading = useEditorSelector(editor, isActiveStyle('h2'))
  const subheading = useEditorSelector(editor, isActiveStyle('h3'))
  const quote = useEditorSelector(editor, isActiveStyle('blockquote'))
  const linked = useEditorSelector(editor, isActiveAnnotation('link', {mode: 'partial'}))
  // Only what the body type can store: a Studio's blockContent may have no subheadings or links.
  const allows = useBodyAllows()
  const can = {
    bold: allows.decorator('strong'),
    italic: allows.decorator('em'),
    link: allows.annotation('link'),
    heading: allows.style('h2'),
    subheading: allows.style('h3'),
    quote: allows.style('blockquote'),
  }
  const hasMarks = can.bold || can.italic || can.link
  const hasStyles = can.heading || can.subheading || can.quote

  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const [linkDraft, setLinkDraft] = useState<string | null>(null)
  const [savedSelection, setSavedSelection] = useState(selection)
  const [toolbarFocused, setToolbarFocused] = useState(false)
  const surface = useRef<HTMLDivElement>(null)

  const visible =
    (hasMarks || hasStyles) &&
    expanded &&
    !onBlockObject &&
    (editorFocused || toolbarFocused || linkDraft !== null)

  const measure = useCallback(() => {
    setAnchor(visible ? editor.dom.getSelectionRect(editor.getSnapshot()) : null)
  }, [editor, visible])
  useLayoutEffect(measure, [measure, selection])
  useViewportChanges(measure)

  useEffect(() => {
    if (!expanded) setLinkDraft(null)
  }, [expanded])

  useEffect(() => {
    if (!visible || !editorFocused) return undefined
    function handleKeyDown(event: KeyboardEvent) {
      if (!event.altKey || event.key !== 'F10') return
      event.preventDefault()
      surface.current?.querySelector('button')?.focus()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [visible, editorFocused])

  if (!visible || !anchor) return null

  const run = (event: Parameters<typeof editor.send>[0]) => {
    editor.send(event)
    editor.send({type: 'focus'})
  }

  function submitLink() {
    const href = linkDraft === null ? null : normalizeHref(linkDraft)
    if (href && savedSelection) {
      editor.send({type: 'annotation.add', annotation: {name: 'link', value: {href}}, at: savedSelection})
    }
    setLinkDraft(null)
    editor.send({type: 'focus'})
  }

  return (
    <Floating anchor={anchor} scheme={scheme} role="toolbar" aria-label="Formatting">
      <FloatingSurface
        ref={surface}
        $round
        onFocus={() => setToolbarFocused(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setToolbarFocused(false)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && event.target instanceof HTMLButtonElement) {
            event.preventDefault()
            editor.send({type: 'focus'})
          }
        }}
      >
        {linkDraft === null ? (
          <Row>
            {can.bold && (
              <BubbleButton label="Bold" icon={BoldIcon} active={bold} onPress={() => run({type: 'decorator.toggle', decorator: 'strong'})} />
            )}
            {can.italic && (
              <BubbleButton label="Italic" icon={ItalicIcon} active={italic} onPress={() => run({type: 'decorator.toggle', decorator: 'em'})} />
            )}
            {!can.link ? null : linked ? (
              <BubbleButton label="Remove link" icon={UnlinkIcon} active onPress={() => run({type: 'annotation.remove', annotation: {name: 'link'}})} />
            ) : (
              <BubbleButton
                label="Link"
                icon={LinkIcon}
                onPress={() => {
                  setSavedSelection(editor.getSnapshot().context.selection)
                  setLinkDraft('')
                }}
              />
            )}
            {hasMarks && hasStyles && <Divider aria-hidden />}
            {can.heading && (
              <BubbleButton label="Heading" active={heading} onPress={() => run({type: 'style.toggle', style: 'h2'})}>
                Heading
              </BubbleButton>
            )}
            {can.subheading && (
              <BubbleButton label="Subheading" active={subheading} onPress={() => run({type: 'style.toggle', style: 'h3'})}>
                Subheading
              </BubbleButton>
            )}
            {can.quote && (
              <BubbleButton label="Quote" active={quote} onPress={() => run({type: 'style.toggle', style: 'blockquote'})}>
                Quote
              </BubbleButton>
            )}
          </Row>
        ) : (
          <LinkInput
             
            autoFocus
            aria-label="Link address"
            placeholder="Paste or type a link, then press Enter"
            value={linkDraft}
            onChange={(event) => setLinkDraft(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                submitLink()
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                setLinkDraft(null)
                editor.send({type: 'focus'})
              }
            }}
            onBlur={() => setLinkDraft(null)}
          />
        )}
      </FloatingSurface>
    </Floating>
  )
}

function BubbleButton({
  label,
  icon: Icon,
  active = false,
  onPress,
  children,
}: {
  label: string
  icon?: ComponentType
  active?: boolean
  onPress: () => void
  children?: ReactNode
}) {
  return (
    <Button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      $active={active}
      // Keep the editor's selection: act on mousedown, never take focus.
      onMouseDown={(event) => {
        event.preventDefault()
        onPress()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onPress()
        }
      }}
    >
      {Icon ? <Icon aria-hidden /> : children}
    </Button>
  )
}

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 2px;
`

const Divider = styled.span`
  width: 1px;
  height: 1.25rem;
  margin-inline: var(--calm-space-xs);
  background: var(--calm-color-rule);
`

const Button = styled.button<{$active: boolean}>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2rem;
  height: 2rem;
  padding: 0 var(--calm-space-sm);
  border: 0;
  border-radius: var(--calm-radius-pill);
  background: ${({$active}) => ($active ? 'var(--calm-color-paper)' : 'transparent')};
  color: ${({$active}) => ($active ? 'var(--calm-color-accent)' : 'var(--calm-color-ink)')};
  font: inherit;
  cursor: pointer;

  &:hover {
    background: var(--calm-color-paper);
  }

  &:focus-visible {
    outline: 2px solid var(--calm-color-accent);
    outline-offset: 1px;
  }

  svg {
    font-size: 1.25rem;
  }
`

const LinkInput = styled.input`
  width: min(22rem, 70vw);
  height: 2rem;
  padding: 0 var(--calm-space-md);
  border: 0;
  border-radius: var(--calm-radius-pill);
  background: var(--calm-color-paper);
  color: var(--calm-color-ink);
  font: inherit;
  outline: none;

  &::placeholder {
    color: var(--calm-color-ink-muted);
  }
`
