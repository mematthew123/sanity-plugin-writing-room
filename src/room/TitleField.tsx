import {type DocumentHandle, useDocument, useEditDocument} from '@sanity/sdk-react'
import {type KeyboardEvent, useLayoutEffect, useRef} from 'react'
import styled from 'styled-components'
import {followingSlug} from '../lib/slug'

interface PostFields {
  title?: string
  slug?: {_type: 'slug'; current?: string}
}

/**
 * The Post's title: one line of Newsreader that wraps but never breaks. Enter moves into the body.
 * Until the first publish, the slug follows the title (unless the Writer set it by hand).
 */
export function TitleField({
  handle,
  isPublished,
  onEnter,
}: {
  handle: DocumentHandle
  isPublished: boolean
  onEnter: () => void
}) {
  const {data: title} = useDocument<string>({...handle, path: 'title'})
  const editPost = useEditDocument<PostFields>(handle)
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
      const nextSlug = isPublished
        ? undefined
        : followingSlug({
            previousTitle: post.title ?? '',
            nextTitle,
            currentSlug: post.slug?.current,
          })
      if (nextSlug === undefined) return {...post, title: nextTitle}
      return {
        ...post,
        title: nextTitle,
        slug: nextSlug ? {_type: 'slug', current: nextSlug} : undefined,
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
