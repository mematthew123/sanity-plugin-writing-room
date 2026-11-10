import {type DocumentHandle, useDocument, useEditDocument} from '@sanity/sdk-react'
import {type KeyboardEvent, useLayoutEffect, useRef} from 'react'
import styled from 'styled-components'
import {followingSlug} from '../lib/slug'
import {type WritingFields} from './fields'

type Slug = {_type: 'slug'; current?: string}

/**
 * The document's title: one line of Newsreader that wraps but never breaks. Enter moves into the
 * body. Until the first publish, the slug follows the title (unless the Writer set it by hand).
 */
export function TitleField({
  handle,
  fields,
  isPublished,
  onEnter,
}: {
  handle: DocumentHandle
  fields: WritingFields
  isPublished: boolean
  onEnter: () => void
}) {
  const {data: title} = useDocument<string>({...handle, path: fields.title})
  const editPost = useEditDocument<Record<string, unknown>>(handle)
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
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
              currentSlug: (post[fields.slug] as Slug | undefined)?.current,
            })
      if (nextSlug === undefined || !fields.slug) return {...post, [fields.title]: nextTitle}
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
    <Title
      ref={ref}
      rows={1}
      value={title ?? ''}
      placeholder="Title"
      aria-label="Title"
      data-calm-field="title"
      spellCheck
      onChange={(event) => setTitle(event.currentTarget.value)}
      onKeyDown={handleKeyDown}
    />
  )
}

const Title = styled.textarea`
  display: block;
  box-sizing: border-box;
  width: 100%;
  margin: 0 0 var(--calm-space-lg);
  padding: 0;
  overflow: hidden;
  border: 0;
  background: transparent;
  color: var(--calm-color-ink);
  caret-color: var(--calm-color-accent);
  font-family: var(--calm-font-prose);
  font-size: var(--calm-type-title);
  font-weight: var(--calm-weight-title);
  line-height: var(--calm-type-heading-leading);
  text-wrap: balance;
  resize: none;
  outline: none;

  &::placeholder {
    color: var(--calm-color-ink-muted);
    opacity: 1;
  }
`
