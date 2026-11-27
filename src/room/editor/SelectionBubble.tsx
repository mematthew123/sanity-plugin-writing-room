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
import {useBodyAllows} from './allows'
import {Floating, FloatingInput, FloatingRow, FloatingSurface, useViewportChanges} from './floating'
import {PillButton} from '../primitives'
import {normalizeHref} from './link'
import styles from './SelectionBubble.module.css'

/** Alt+F10 focuses it, since it's portaled and Tab never reaches it; Esc returns to the text. */
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
  // A Studio's body type may have no subheadings or links.
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
        round
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
          <FloatingRow>
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
            {hasMarks && hasStyles && <span className={styles.divider} aria-hidden />}
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
          </FloatingRow>
        ) : (
          <FloatingInput
             
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
    <PillButton
      className={styles.button}
      aria-label={label}
      aria-pressed={active}
      title={label}
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
    </PillButton>
  )
}
