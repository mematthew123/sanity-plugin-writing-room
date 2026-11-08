import {
  defineAnnotation,
  defineBlockObject,
  defineDecorator,
  defineTextBlock,
  type TextBlockRenderProps,
} from '@portabletext/editor'
import {CodeBlock} from './blocks/CodeBlock'
import {EmbedBlock} from './blocks/EmbedBlock'
import {ImageBlock} from './blocks/ImageBlock'
import {SectionBreak} from './blocks/SectionBreak'

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

/** How each part of the body looks in the Writing Room. Module scope keeps registrations stable. */
export const nodes = [
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
  defineBlockObject({type: 'embed', render: (props) => <EmbedBlock {...props} />}),
  defineBlockObject({type: 'codeBlock', render: (props) => <CodeBlock {...props} />}),
  defineBlockObject({type: 'sectionBreak', render: (props) => <SectionBreak {...props} />}),
]
