import {type BlockObjectRenderProps} from '@portabletext/editor'
import styled from 'styled-components'
import {QuietButton} from '../../primitives'
import {useOpenBlockInStructure} from '../room-document'
import {BlockFrame, Controls} from './frame'

/** Keeps an unrecognised block's place in the text; it's edited in Structure. */
export function UnknownBlock({attributes, children, node, selected, title}: BlockObjectRenderProps & {title: string}) {
  const openInStructure = useOpenBlockInStructure(node._key)
  return (
    <BlockFrame {...attributes} data-calm-block={node._key} $selected={selected}>
      {children}
      <Card contentEditable={false}>
        <Name>{title}</Name>
        <Controls>
          <QuietButton onClick={openInStructure}>Edit in Structure</QuietButton>
        </Controls>
      </Card>
    </BlockFrame>
  )
}

const Card = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--calm-space-sm);
  padding: var(--calm-space-md) var(--calm-space-lg);
  border: 1px dashed var(--calm-color-rule);
  border-radius: var(--calm-radius-large);
  color: var(--calm-color-ink-muted);
  font-family: var(--calm-font-ui);
  font-size: var(--calm-type-ui-size);
  user-select: none;

  ${Controls} {
    margin-top: 0;
  }
`

const Name = styled.span`
  color: var(--calm-color-ink);
`
