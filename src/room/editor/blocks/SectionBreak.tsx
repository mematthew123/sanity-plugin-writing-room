import {type BlockObjectRenderProps} from '@portabletext/editor'
import styled from 'styled-components'
import {BlockFrame} from './frame'

export function SectionBreak({attributes, children, node, selected}: BlockObjectRenderProps) {
  return (
    <Frame {...attributes} data-calm-block={node._key} $selected={selected}>
      {children}
      <Ornament contentEditable={false} role="separator" aria-label="Section break">
        ✦ ✦ ✦
      </Ornament>
    </Frame>
  )
}

const Frame = styled(BlockFrame)`
  margin-block: var(--calm-space-xl);
`

const Ornament = styled.div`
  padding-block: var(--calm-space-xs);
  color: var(--calm-color-ink-faint);
  font-family: var(--calm-font-prose);
  letter-spacing: 0.5em;
  text-align: center;
  user-select: none;
`
