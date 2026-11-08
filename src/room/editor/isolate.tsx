import {type ReactNode, type SyntheticEvent} from 'react'
import styled from 'styled-components'

const stop = (event: SyntheticEvent) => event.stopPropagation()

const Root = styled.div`
  user-select: none;
`

/**
 * Hosts interactive controls (inputs, buttons) inside a block object. The editor would otherwise
 * treat clicks, keys and pastes here as edits to the text around it.
 */
export function Isolate({children, className}: {children: ReactNode; className?: string}) {
  return (
    <Root
      className={className}
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
    </Root>
  )
}
