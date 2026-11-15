import {type BlockObjectRenderProps} from '@portabletext/editor'
import {QuietButton} from '../../primitives'
import {useOpenBlockInStructure} from '../room-document'
import {BlockFrame, Controls} from './frame'
import styles from './UnknownBlock.module.css'

/** Keeps an unrecognised block's place in the text; it's edited in Structure. */
export function UnknownBlock({attributes, children, node, selected, title}: BlockObjectRenderProps & {title: string}) {
  const openInStructure = useOpenBlockInStructure(node._key)
  return (
    <BlockFrame {...attributes} data-calm-block={node._key} selected={selected}>
      {children}
      <div className={styles.card} contentEditable={false}>
        <span className={styles.name}>{title}</span>
        <Controls className={styles.controls}>
          <QuietButton onClick={openInStructure}>Edit in Structure</QuietButton>
        </Controls>
      </div>
    </BlockFrame>
  )
}
