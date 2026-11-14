import {type BlockObjectRenderProps} from '@portabletext/editor'
import {BlockFrame} from './frame'
import styles from './SectionBreak.module.css'

export function SectionBreak({attributes, children, node, selected}: BlockObjectRenderProps) {
  return (
    <BlockFrame {...attributes} className={styles.frame} data-calm-block={node._key} selected={selected}>
      {children}
      <div className={styles.ornament} contentEditable={false} role="separator" aria-label="Section break">
        ✦ ✦ ✦
      </div>
    </BlockFrame>
  )
}
