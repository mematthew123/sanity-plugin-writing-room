import {Component, type ReactNode} from 'react'
import styled from 'styled-components'
import {Column} from './primitives'

/**
 * The App SDK's error when the room's `@sanity/sdk-react` isn't the copy the Studio provides.
 * It's a setup problem, not a bug in the room, so the room explains it instead of crashing.
 */
export function isSdkContextError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('SanityInstance context not found')
}

/**
 * Catches the App SDK context error anywhere in the room and says how to fix it. Any other error
 * is rethrown, so the Studio's own error screen handles it as usual.
 */
export class SetupProblemBoundary extends Component<{children: ReactNode}, {error: unknown}> {
  override state: {error: unknown} = {error: null}

  static getDerivedStateFromError(error: unknown) {
    return {error}
  }

  override render() {
    const {error} = this.state
    if (!error) return this.props.children
    if (!isSdkContextError(error)) throw error
    return <SdkContextProblem />
  }
}

function SdkContextProblem() {
  return (
    <Column as="main" role="alert">
      <Heading>The Writing Room can’t start in this Studio yet</Heading>
      <p>
        The room and the Studio are using different copies of Sanity’s App SDK, so the room can’t
        reach your content.
      </p>
      <p>
        <strong>On a deployed Studio</strong>, this means auto-updates are on. Set{' '}
        <code>deployment: {'{'}autoUpdates: false{'}'}</code> in <code>sanity.cli.ts</code> and deploy
        again.
      </p>
      <p>
        <strong>In <code>sanity dev</code></strong>, the Studio has two copies of{' '}
        <code>@sanity/sdk-react</code>. Run <code>npm ls @sanity/sdk-react</code>: it should appear at a
        single version. If the plugin is linked rather than installed, add{' '}
        <code>@sanity/sdk-react</code> and <code>sanity</code> to Vite’s <code>resolve.dedupe</code> in{' '}
        <code>sanity.cli.ts</code>.
      </p>
    </Column>
  )
}

const Heading = styled.h1`
  margin: 0 0 var(--calm-space-lg);
  font-family: var(--calm-font-prose);
  font-size: calc(var(--calm-prose-size-medium) * 1.4);
  font-weight: var(--calm-weight-title);
  line-height: var(--calm-type-heading-leading);
  text-wrap: balance;
`
