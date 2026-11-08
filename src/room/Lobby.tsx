import {AddIcon} from '@sanity/icons/Add'
import {ArrowLeftIcon} from '@sanity/icons/ArrowLeft'
import {ArrowRightIcon} from '@sanity/icons/ArrowRight'
import {
  type DocumentHandle,
  useCreateDocument,
  useDocumentProjection,
  useDocuments,
} from '@sanity/sdk-react'
import {Suspense, useRef, useState} from 'react'
import {useCurrentUser} from 'sanity'
import {StateLink, useRouter} from 'sanity/router'
import styled from 'styled-components'
import {useAllPostsPath, useLeaveToStudio} from './navigation'
import {describePostStatus, timeAgo} from './post-status'
import {Column, Placeholder, QuietButton, RoomControls, SectionLabel} from './primitives'
import {ThemeToggle} from './room-status'
import {useEscape} from './use-escape'

const RECENT_POSTS = 8

/** The entrance to the Writing Room: start a new Post or pick up a recent one. */
export function Lobby() {
  const leave = useLeaveToStudio()
  useEscape(leave)

  return (
    <>
      <RoomControls
        start={
          <QuietButton icon={ArrowLeftIcon} onClick={leave}>
            Leave the Writing Room
          </QuietButton>
        }
        end={<ThemeToggle />}
      />
      <Column as="main">
        <Greeting />
        <StartNewPost />
        <Recent aria-labelledby="recent-posts">
          <SectionLabel id="recent-posts">Recent Posts</SectionLabel>
          <Suspense fallback={<RecentPostsPlaceholder />}>
            <RecentPosts />
          </Suspense>
        </Recent>
        <AllPostsLink />
      </Column>
    </>
  )
}

function partOfDay(hour: number) {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

const GreetingHeading = styled.h1`
  margin: 0 0 var(--calm-space-xl);
  font-family: var(--calm-font-prose);
  font-size: calc(var(--calm-prose-size-medium) * 1.8);
  font-weight: var(--calm-weight-title);
  line-height: var(--calm-type-heading-leading);
  text-wrap: balance;
`

function Greeting() {
  const user = useCurrentUser()
  const firstName = user?.name?.split(' ')[0]
  const greeting = partOfDay(new Date().getHours())
  return <GreetingHeading>{firstName ? `${greeting}, ${firstName}` : greeting}</GreetingHeading>
}

const StartButton = styled.button`
  display: flex;
  align-items: center;
  gap: var(--calm-space-md);
  width: 100%;
  padding: var(--calm-space-lg);
  border: 0;
  border-radius: var(--calm-radius-large);
  background: var(--calm-color-surface);
  color: var(--calm-color-ink);
  font-family: var(--calm-font-prose);
  font-size: calc(var(--calm-prose-size-medium) * 1.2);
  font-weight: var(--calm-weight-title);
  text-align: start;
  cursor: pointer;
  transition: box-shadow var(--calm-motion-gentle) var(--calm-motion-easing);

  &:hover {
    box-shadow: inset 0 0 0 1px var(--calm-color-rule);
  }

  &:focus-visible {
    outline: 2px solid var(--calm-color-accent);
    outline-offset: 2px;
  }

  svg {
    flex-shrink: 0;
    color: var(--calm-color-accent);
    font-size: 1.5rem;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`

function StartNewPost() {
  const router = useRouter()
  const createPost = useCreateDocument({documentType: 'post'})
  const [isCreating, setIsCreating] = useState(false)

  async function start() {
    if (isCreating) return
    setIsCreating(true)
    try {
      const post = await createPost()
      router.navigate({postId: post.documentId})
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <StartButton type="button" onClick={start} aria-busy={isCreating}>
      <AddIcon aria-hidden />
      Start a new Post
    </StartButton>
  )
}

const Recent = styled.section`
  margin-top: var(--calm-space-xl);
`

const PostList = styled.ul`
  display: grid;
  gap: var(--calm-space-xs);
  margin: 0 calc(var(--calm-space-md) * -1);
  padding: 0;
  list-style: none;
`

const Empty = styled.p`
  margin: 0;
  color: var(--calm-color-ink-muted);
`

function RecentPosts() {
  const {data} = useDocuments({
    documentType: 'post',
    batchSize: RECENT_POSTS,
    orderings: [{field: '_updatedAt', direction: 'desc'}],
  })

  if (data.length === 0) {
    return <Empty>Nothing here yet. Your first Post is one click away.</Empty>
  }

  return (
    <PostList>
      {data.slice(0, RECENT_POSTS).map((handle) => (
        <li key={handle.documentId}>
          <Suspense fallback={<Placeholder $height="4.5rem" />}>
            <PostRow {...handle} />
          </Suspense>
        </li>
      ))}
    </PostList>
  )
}

function RecentPostsPlaceholder() {
  return (
    <PostList aria-hidden>
      {[0, 1, 2].map((i) => (
        <li key={i}>
          <Placeholder $height="4.5rem" />
        </li>
      ))}
    </PostList>
  )
}

const RowLink = styled(StateLink)`
  display: block;
  padding: var(--calm-space-md);
  border-radius: var(--calm-radius-large);
  color: inherit;
  text-decoration: none;
  transition: background-color var(--calm-motion-gentle) var(--calm-motion-easing);

  &:hover {
    background: var(--calm-color-surface);
  }

  &:focus-visible {
    outline: 2px solid var(--calm-color-accent);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`

const RowTitle = styled.span`
  display: block;
  font-family: var(--calm-font-prose);
  font-size: calc(var(--calm-prose-size-medium) * 1.2);
  font-weight: var(--calm-weight-heading);
  line-height: var(--calm-type-heading-leading);
  text-wrap: pretty;
`

const RowMeta = styled.span`
  display: block;
  margin-top: var(--calm-space-xs);
  color: var(--calm-color-ink-muted);
  font-size: var(--calm-type-ui-size-small);
`

function PostRow(handle: DocumentHandle) {
  const ref = useRef<HTMLDivElement>(null)
  const {data} = useDocumentProjection<{title?: string}>({...handle, ref, projection: '{title}'})
  const status = describePostStatus(data?._status)

  return (
    <div ref={ref}>
      <RowLink state={{postId: handle.documentId}}>
        <RowTitle>{data?.title || 'Untitled'}</RowTitle>
        <RowMeta>
          {status.label}
          {status.lastEditedAt && ` · ${timeAgo(status.lastEditedAt)}`}
        </RowMeta>
      </RowLink>
    </div>
  )
}

const AllPosts = styled.a`
  display: inline-flex;
  align-items: center;
  gap: var(--calm-space-xs);
  margin-top: var(--calm-space-lg);
  color: var(--calm-color-ink-muted);
  text-decoration: none;

  &:hover {
    color: var(--calm-color-ink);
  }

  &:focus-visible {
    outline: 2px solid var(--calm-color-accent);
    outline-offset: 2px;
    border-radius: var(--calm-radius);
  }
`

function AllPostsLink() {
  const {navigateUrl} = useRouter()
  const path = useAllPostsPath()
  return (
    <AllPosts
      href={path}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
        event.preventDefault()
        navigateUrl({path})
      }}
    >
      All Posts
      <ArrowRightIcon aria-hidden />
    </AllPosts>
  )
}
