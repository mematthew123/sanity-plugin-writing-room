import {
  defineAnnotation,
  defineBlockObject,
  defineDecorator,
  defineTextBlock,
  type EditorSchema,
  type TextBlockRenderProps,
} from '@portabletext/editor'
import {CodeBlock} from './blocks/CodeBlock'
import {EmbedBlock} from './blocks/EmbedBlock'
import {ImageBlock} from './blocks/ImageBlock'
import {SectionBreak} from './blocks/SectionBreak'
import {UnknownBlock} from './blocks/UnknownBlock'
import {ROOM_BLOCK_NAMES, ROOM_BLOCKS} from './allows'

function TextBlock({attributes: pteAttributes, children, node}: TextBlockRenderProps) {
  const attributes = {...pteAttributes, 'data-calm-block': node._key}
  if (node.listItem) {
    return (
      <div {...attributes} data-list-item={node.listItem} data-level={node.level ?? 1}>
        {children}
      </div>
    )
  }
  switch (node.style) {
    case 'h2':
      return <h2 {...attributes}>{children}</h2>
    case 'h3':
      return <h3 {...attributes}>{children}</h3>
    case 'blockquote':
      return <blockquote {...attributes}>{children}</blockquote>
    default:
      return <p {...attributes}>{children}</p>
  }
}

const knownNodes = [
  defineTextBlock({type: 'block', render: (props) => <TextBlock {...props} />}),
  defineDecorator({type: 'strong', render: ({children}) => <strong>{children}</strong>}),
  defineDecorator({type: 'em', render: ({children}) => <em>{children}</em>}),
  defineAnnotation({
    type: 'link',
    // A span, not an anchor: links shouldn't navigate away mid-sentence.
    render: ({annotation, children}) => (
      <span data-link title={typeof annotation.href === 'string' ? annotation.href : undefined}>
        {children}
      </span>
    ),
  }),
  defineBlockObject({type: 'image', render: (props) => <ImageBlock {...props} />}),
  ...ROOM_BLOCKS.embed.map((type) => defineBlockObject({type, render: (props) => <EmbedBlock {...props} />})),
  ...ROOM_BLOCKS.codeBlock.map((type) => defineBlockObject({type, render: (props) => <CodeBlock {...props} />})),
  ...ROOM_BLOCKS.sectionBreak.map((type) =>
    defineBlockObject({type, render: (props) => <SectionBreak {...props} />}),
  ),
]


/** Unknown block types get a placeholder so they keep their place. Memoise on the schema. */
export function bodyNodes(schema: EditorSchema) {
  const unknown = schema.blockObjects
    .filter((block) => block.name !== 'image' && !ROOM_BLOCK_NAMES.has(block.name))
    .map((block) => {
      const title = block.title ?? block.name
      return defineBlockObject({type: block.name, render: (props) => <UnknownBlock {...props} title={title} />})
    })
  return [...knownNodes, ...unknown]
}
