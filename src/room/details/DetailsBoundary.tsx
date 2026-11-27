import {Component, type ReactNode} from 'react'
import {QuietButton} from '../primitives'
import styles from './DetailsBoundary.module.css'

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
      <div className={styles.card} role="alert">
        Details couldn’t open here.
        <QuietButton onClick={this.props.onOpenInStructure}>Open in Structure</QuietButton>
      </div>
    )
  }
}
