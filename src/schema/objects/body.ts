import {ImageIcon} from '@sanity/icons/Image'
import {defineArrayMember, defineField, defineType, type PortableTextBlock} from 'sanity'

const MAX_LIST_DEPTH = 2

/** Whether a body has any words or objects, not just blank paragraphs. */
function hasProse(blocks: PortableTextBlock[] | undefined): boolean {
  return (blocks ?? []).some(
    (block) =>
      block._type !== 'block' ||
      (Array.isArray(block.children) ? block.children : []).some(
        (child) => typeof child.text === 'string' && child.text.trim() !== '',
      ),
  )
}

/** The body of a Post: the Prose a Writer composes in the Writing Room. */
export const body = defineType({
  name: 'body',
  type: 'array',
  of: [
    defineArrayMember({
      type: 'block',
      styles: [
        {title: 'Paragraph', value: 'normal'},
        {title: 'Heading', value: 'h2'},
        {title: 'Subheading', value: 'h3'},
        {title: 'Quote', value: 'blockquote'},
      ],
      lists: [
        {title: 'Bulleted list', value: 'bullet'},
        {title: 'Numbered list', value: 'number'},
      ],
      marks: {
        decorators: [
          {title: 'Bold', value: 'strong'},
          {title: 'Italic', value: 'em'},
        ],
        annotations: [
          defineArrayMember({
            name: 'link',
            type: 'object',
            fields: [
              defineField({
                name: 'href',
                title: 'Link',
                type: 'url',
                validation: (rule) =>
                  rule
                    .required()
                    .uri({scheme: ['http', 'https', 'mailto']})
                    .error('Links need a full web address, like https://example.com'),
              }),
            ],
          }),
        ],
      },
    }),
    defineArrayMember({
      name: 'image',
      type: 'image',
      icon: ImageIcon,
      options: {hotspot: true},
      fields: [
        defineField({
          name: 'alt',
          title: 'Description',
          type: 'string',
          description: 'Describe this image for people who can’t see it.',
          validation: (rule) =>
            rule.custom((alt, context) => {
              const image = context.parent as {asset?: unknown} | undefined
              if (!image?.asset || alt?.trim()) return true
              return 'Describe this image for people who can’t see it.'
            }),
        }),
        defineField({
          name: 'caption',
          type: 'string',
        }),
      ],
    }),
    defineArrayMember({type: 'embed'}),
    defineArrayMember({type: 'codeBlock'}),
    defineArrayMember({type: 'sectionBreak'}),
  ],
  validation: (rule) => [
    rule
      .required()
      .custom((blocks: PortableTextBlock[] | undefined) =>
        blocks === undefined || hasProse(blocks) ? true : 'Write something before publishing.',
      )
      .error('Write something before publishing.'),
    rule.custom((blocks: PortableTextBlock[] | undefined) => {
      const tooDeep = blocks?.find(
        (block) => typeof block.level === 'number' && block.level > MAX_LIST_DEPTH,
      )
      return tooDeep
        ? {
            message: `Lists can be nested ${MAX_LIST_DEPTH} levels deep.`,
            path: [{_key: tooDeep._key}],
          }
        : true
    }),
  ],
})
