import {type ReactNode, type SyntheticEvent} from 'react'
import {cx} from '../../lib/cx'
import styles from './isolate.module.css'

const stop = (event: SyntheticEvent) => event.stopPropagation()

/** Stops the editor treating clicks, keys and pastes on controls inside a block object as text edits. */
export function Isolate({children, className}: {children: ReactNode; className?: string}) {
  return (
    <div
      className={cx(styles.root, className)}
      contentEditable={false}
      onKeyDown={stop}
      onKeyUp={stop}
      onBeforeInput={stop}
      onPaste={stop}
      onCopy={stop}
      onCut={stop}
      onDrop={stop}
      onClick={stop}
      onMouseDown={stop}
    >
      {children}
    </div>
  )
}
