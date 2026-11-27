import {type BlockObjectRenderProps} from '@portabletext/editor'
import {useDataset, useProjectId} from 'sanity'
import {imageUrl} from '../../../lib/image-url'
import {useBodyAllows} from '../allows'
import {useBlockField} from '../use-block-field'
import {BlockFrame, Controls, FieldInput} from './frame'
import styles from './ImageBlock.module.css'

const ROOM_IMAGE_WIDTH = 1520

export function ImageBlock({attributes, children, node, selected}: BlockObjectRenderProps) {
  const projectId = useProjectId()
  const dataset = useDataset()
  const ref = (node.asset as {_ref?: string} | undefined)?._ref
  const src = imageUrl(ref, {projectId, dataset}, {width: ROOM_IMAGE_WIDTH})
  const alt = useBlockField(node._key, 'alt', node.alt)
  const caption = useBlockField(node._key, 'caption', node.caption)
  // A Studio's image type may have no alt or caption.
  const allows = useBodyAllows()
  const hasAlt = allows.blockField(node._type, 'alt')
  const hasCaption = allows.blockField(node._type, 'caption')

  return (
    <BlockFrame {...attributes} data-calm-block={node._key} selected={selected}>
      {children}
      <Controls>
        {src ? (
          <img className={styles.picture} src={src} alt={alt.value} draggable={false} />
        ) : (
          <div className={styles.shimmer} role="status" aria-label="Uploading image" />
        )}
        {hasAlt && (
          <FieldInput
            aria-label="Image description"
            data-calm-field={`${node._key}.alt`}
            placeholder="Describe this image for people who can’t see it"
            value={alt.value}
            onChange={(event) => alt.onChange(event.currentTarget.value)}
            onBlur={alt.onBlur}
          />
        )}
        {hasCaption && (
          <FieldInput
            aria-label="Caption"
            placeholder="Add a caption (optional)"
            value={caption.value}
            onChange={(event) => caption.onChange(event.currentTarget.value)}
            onBlur={caption.onBlur}
          />
        )}
      </Controls>
    </BlockFrame>
  )
}
