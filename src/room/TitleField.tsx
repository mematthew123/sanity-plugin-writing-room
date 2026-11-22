import {type DocumentHandle, useDocument, useEditDocument} from '@sanity/sdk-react'
import {type KeyboardEvent, useLayoutEffect, useRef} from 'react'
import {followingSlug} from '../lib/slug'
import {slugByHand} from './details/slug-by-hand'
import {type WritingFields} from './fields'
import styles from './TitleField.module.css'

type Slug = {_type: 'slug'; current?: string}

/** Until the first publish, the slug follows the title unless the Writer set it by hand. */
export function TitleField({
  handle,
  fields,
  isPublished,
  readOnly = false,
  onEnter,
}: {
  handle: DocumentHandle
  fields: WritingFields
  isPublished: boolean
  readOnly?: boolean
  onEnter: () => void
}) {
  const {data: title} = useDocument<string>({...handle, path: fields.title})
  const editPost = useEditDocument<Record<string, unknown>>(handle)
  const ref = useRef<HTMLTextAreaElement>(null)

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

  function setTitle(raw: string) {
    const nextTitle = raw.replace(/\s*\n\s*/g, ' ')
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
        if (!readOnly) setTitle(event.currentTarget.value)
      }}
      onKeyDown={handleKeyDown}
    />
  )
}
