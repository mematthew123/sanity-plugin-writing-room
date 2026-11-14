import {useEditor, useEditorSelector} from '@portabletext/editor'
import {isSelectionCollapsed} from '@portabletext/editor/selectors'
import {useAnnotationPopover, useToolbarSchema} from '@portabletext/toolbar'
import {LaunchIcon} from '@sanity/icons/Launch'
import {useCallback, useEffect, useLayoutEffect, useState} from 'react'
import {Floating, FloatingSurface, useViewportChanges} from './floating'
import {displayHref, normalizeHref} from './link'
import styles from './LinkPopover.module.css'

/** Long enough that typing through a link never shows the popover. */
const REST_MS = 400

/** For a collapsed caret only; a selection gets the Selection Bubble. */
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
      <FloatingSurface className={styles.surface} round>
        {editing ? (
          <input
            className={styles.input}
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
          <div className={styles.row}>
            <a className={styles.address} href={href} target="_blank" rel="noopener noreferrer" title={href}>
              {displayHref(href) || 'No address'}
              <LaunchIcon aria-hidden />
            </a>
            <button className={styles.action} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => setDraft(href)}>
              Edit
            </button>
            <button
              className={styles.action}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                popover.send({type: 'remove', schemaType: link.schemaType})
                editor.send({type: 'focus'})
              }}
            >
              Remove
            </button>
          </div>
        )}
      </FloatingSurface>
    </Floating>
  )
}
