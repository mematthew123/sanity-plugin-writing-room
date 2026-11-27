import {type DocumentHandle, useDocument, useEditDocument} from '@sanity/sdk-react'
import {type KeyboardEvent, useLayoutEffect, useRef} from 'react'
import {followingSlug} from '../lib/slug'
import {slugByHand} from './details/slug-by-hand'
import {type WritingFields} from './fields'
import styles from './TitleField.module.css'

type Slug = {_type: 'slug'; current?: string}

function singleLine(raw: string) {
  return raw.replace(/\s*\n\s*/g, ' ')
}

/** Until the first publish, the slug follows the title unless the Writer set it by hand. */
export function TitleField({
  handle,
  fields,
  isPublished,
  readOnly = false,
  onEnter,
  onPastePiece,
}: {
  handle: DocumentHandle
  fields: WritingFields
  isPublished: boolean
  readOnly?: boolean
  onEnter: () => void
  /**
   * Offered every paste. True means the room has taken it to the body, because a title can't hold
   * paragraphs; `asTitle` is for the room to call if the body turns out not to take it.
   */
  onPastePiece?: (data: DataTransfer, asTitle: () => void) => boolean
}) {
  const {data: title} = useDocument<string>({...handle, path: fields.title})
  const editPost = useEditDocument<Record<string, unknown>>(handle)
  const ref = useRef<HTMLTextAreaElement>(null)
  const pasteCaret = useRef<{title: string; offset: number} | null>(null)

  useLayoutEffect(() => {
    const pending = pasteCaret.current
    pasteCaret.current = null
    const el = ref.current
    if (pending && el && el === el.ownerDocument.activeElement && el.value === pending.title) {
      el.setSelectionRange(pending.offset, pending.offset)
    }
  }, [title])

  // As tall as its text: whenever the title changes, and whenever it wraps differently (the window
  // narrows, or the room's fonts arrive after the first paint).
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const fit = () => {
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    }
    fit()
    let width = el.clientWidth
    const resized = new ResizeObserver(() => {
      if (el.clientWidth === width) return
      width = el.clientWidth
      fit()
    })
    resized.observe(el)
    document.fonts?.addEventListener('loadingdone', fit)
    return () => {
      resized.disconnect()
      document.fonts?.removeEventListener('loadingdone', fit)
    }
  }, [title])

  function setTitle(nextTitle: string) {
    editPost((current) => {
      const post = current ?? {}
      const previousTitle = typeof post[fields.title] === 'string' ? (post[fields.title] as string) : ''
      const nextSlug =
        isPublished || !fields.slug
          ? undefined
          : followingSlug({
              previousTitle,
              nextTitle,
              // A slug typed in Details a moment ago may not have reached this copy yet.
              currentSlug: slugByHand.read(handle.documentId) ?? (post[fields.slug] as Slug | undefined)?.current,
            })
      if (nextSlug === undefined || !fields.slug) return {...post, [fields.title]: nextTitle}
      slugByHand.forget(handle.documentId)
      return {
        ...post,
        [fields.title]: nextTitle,
        [fields.slug]: nextSlug ? {_type: 'slug', current: nextSlug} : undefined,
      }
    })
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault()
      onEnter()
    }
  }

  return (
    <textarea
      className={styles.title}
      ref={ref}
      rows={1}
      value={title ?? ''}
      placeholder="Title"
      aria-label="Title"
      data-calm-field="title"
      spellCheck
      readOnly={readOnly}
      onChange={(event) => {
        if (!readOnly) setTitle(singleLine(event.currentTarget.value))
      }}
      onKeyDown={handleKeyDown}
      onPaste={(event) => {
        if (readOnly || !onPastePiece) return
        const text = event.clipboardData.getData('text/plain')
        const {selectionStart, selectionEnd, value} = event.currentTarget
        // The default paste, if the body doesn't take it.
        const asTitle = () => {
          const el = ref.current
          if (!el) return
          const throughPaste = value.slice(0, selectionStart) + text
          const nextTitle = singleLine(throughPaste + value.slice(selectionEnd))
          const offset = singleLine(throughPaste).length
          // A controlled value update can move the caret, so restore it after React commits.
          pasteCaret.current = el.value === nextTitle ? null : {title: nextTitle, offset}
          el.focus()
          if (!pasteCaret.current) el.setSelectionRange(offset, offset)
          setTitle(nextTitle)
        }
        if (onPastePiece(event.clipboardData, asTitle)) event.preventDefault()
      }}
    />
  )
}
