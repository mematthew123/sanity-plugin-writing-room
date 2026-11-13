import {Component, type ReactNode} from 'react'
import styled from 'styled-components'
import {QuietButton} from '../primitives'

/** Fails soft: a form that can't render never takes the Prose down with it. */
export class DetailsBoundary extends Component<
  {children: ReactNode; onOpenInStructure: () => void},
  {failed: boolean}
> {
  state = {failed: false}

  static getDerivedStateFromError() {
    return {failed: true}
  }

  componentDidCatch(error: unknown) {
    console.error('[sanity-plugin-writing-room] Details couldn’t render.', error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <Card role="alert">
        Details couldn’t open here.
        <QuietButton onClick={this.props.onOpenInStructure}>Open in Structure</QuietButton>
      </Card>
    )
  }
}

const Card = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--calm-space-sm);
  margin-top: var(--calm-space-xl);
  padding: var(--calm-space-md) var(--calm-space-lg);
  border-radius: var(--calm-radius-large);
  background: var(--calm-color-surface);
  color: var(--calm-color-ink-muted);
  font-family: var(--calm-font-ui);
  font-size: var(--calm-type-ui-size);
`
