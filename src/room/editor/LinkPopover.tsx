import {useEditor, useEditorSelector} from '@portabletext/editor'
import {isSelectionCollapsed} from '@portabletext/editor/selectors'
import {useAnnotationPopover, useToolbarSchema} from '@portabletext/toolbar'
import {LaunchIcon} from '@sanity/icons/Launch'
import {useCallback, useEffect, useLayoutEffect, useState} from 'react'
import styled from 'styled-components'
import {Floating, FloatingSurface, useViewportChanges} from './floating'
import {displayHref, normalizeHref} from './link'

/** How long the caret must rest in a link before its popover appears, so typing never triggers it. */
const REST_MS = 400

/**
 * When the caret rests inside a link: a small popover below it to open, edit or remove the link.
 * A selection gets the Selection Bubble instead; this is only for a collapsed caret.
 */
export function LinkPopover({scheme, editorFocused}: {scheme: string; editorFocused: boolean}) {
  const editor = useEditor()
  const toolbarSchema = useToolbarSchema({})
  const popover = useAnnotationPopover({schemaTypes: toolbarSchema.annotations})
  const collapsed = useEditorSelector(editor, isSelectionCollapsed)
  const selection = useEditorSelector(editor, (snapshot) => snapshot.context.selection)
  const link = popover.snapshot.context.annotations.find((annotation) => annotation.schemaType.name === 'link')

  const [rested, setRested] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)

  const editing = draft !== null
  const inLink = !!link && collapsed && popover.snapshot.matches({enabled: 'active'})
  const visible = inLink && (editing || (editorFocused && rested))

  // Hide while the caret moves; show again once it has rested.
  useEffect(() => {
    setRested(false)
    if (!inLink) {
      setDraft(null)
      return undefined
    }
    const timer = setTimeout(() => setRested(true), REST_MS)
    return () => clearTimeout(timer)
  }, [inLink, selection])

  const measure = useCallback(() => {
    const element = popover.snapshot.context.elementRef.current
    setAnchor(visible && element ? element.getBoundingClientRect() : null)
  }, [popover.snapshot.context.elementRef, visible])
  useLayoutEffect(measure, [measure, selection])
  useViewportChanges(measure)

  if (!visible || !anchor || !link) return null
  const href = typeof link.value.href === 'string' ? link.value.href : ''

  function close() {
    setDraft(null)
    popover.send({type: 'close'})
    editor.send({type: 'focus'})
  }

  function save() {
    const next = draft === null ? null : normalizeHref(draft)
    if (next && link) popover.send({type: 'edit', at: link.at, props: {href: next}})
    setDraft(null)
    editor.send({type: 'focus'})
  }

  return (
    <Floating
      anchor={anchor}
      placement="below"
      align="start"
      scheme={scheme}
      role="dialog"
      aria-label="Link"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          close()
        }
      }}
    >
      <Surface $round>
        {editing ? (
          <Input
            autoFocus
            aria-label="Link address"
            value={draft}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                save()
              }
            }}
            onBlur={() => setDraft(null)}
          />
        ) : (
          <Row>
            <Address href={href} target="_blank" rel="noopener noreferrer" title={href}>
              {displayHref(href) || 'No address'}
              <LaunchIcon aria-hidden />
            </Address>
            <Action type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => setDraft(href)}>
              Edit
            </Action>
            <Action
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                popover.send({type: 'remove', schemaType: link.schemaType})
                editor.send({type: 'focus'})
              }}
            >
              Remove
            </Action>
          </Row>
        )}
      </Surface>
    </Floating>
  )
}

const Surface = styled(FloatingSurface)`
  max-width: min(28rem, calc(100vw - 2rem));
`

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 2px;
`

const Address = styled.a`
  display: inline-flex;
  align-items: center;
  gap: var(--calm-space-xs);
  min-width: 0;
  padding: 0 var(--calm-space-sm) 0 var(--calm-space-md);
  overflow: hidden;
  color: var(--calm-color-accent);
  text-decoration: none;
  text-overflow: ellipsis;
  white-space: nowrap;

  &:hover {
    text-decoration: underline;
  }

  svg {
    flex-shrink: 0;
    font-size: 1rem;
  }
`

const Action = styled.button`
  flex-shrink: 0;
  height: 2rem;
  padding: 0 var(--calm-space-sm);
  border: 0;
  border-radius: var(--calm-radius-pill);
  background: transparent;
  color: var(--calm-color-ink-muted);
  font: inherit;
  cursor: pointer;

  &:hover,
  &:focus-visible {
    background: var(--calm-color-paper);
    color: var(--calm-color-ink);
  }

  &:focus-visible {
    outline: 2px solid var(--calm-color-accent);
    outline-offset: 1px;
  }
`

const Input = styled.input`
  width: min(22rem, 70vw);
  height: 2rem;
  padding: 0 var(--calm-space-md);
  border: 0;
  border-radius: var(--calm-radius-pill);
  background: var(--calm-color-paper);
  color: var(--calm-color-ink);
  font: inherit;
  outline: none;
`
