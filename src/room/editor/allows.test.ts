import {sanitySchemaToPortableTextSchema} from '@portabletext/sanity-bridge'
import {type ArraySchemaType, createSchema} from 'sanity'
import {describe, expect, it} from 'vitest'
import {schemaTypes} from '../../schema'
import {bodyAllows} from './allows'
import {matchCommands} from './commands'

const compiled = createSchema({
  name: 'test',
  types: [
    ...schemaTypes,
    // Chipter's blockContent: no embeds, code blocks, section breaks or numbered lists.
    {
      name: 'blockContent',
      type: 'array',
      of: [
        {
          type: 'block',
          styles: [
            {title: 'Normal', value: 'normal'},
            {title: 'H2', value: 'h2'},
            {title: 'H3', value: 'h3'},
            {title: 'H4', value: 'h4'},
            {title: 'Quote', value: 'blockquote'},
          ],
          lists: [{title: 'Bullet', value: 'bullet'}],
          marks: {
            decorators: [
              {title: 'Strong', value: 'strong'},
              {title: 'Emphasis', value: 'em'},
            ],
            annotations: [{name: 'link', type: 'object', fields: [{name: 'href', type: 'url'}]}],
          },
        },
        {type: 'image', options: {hotspot: true}},
      ],
    },
  ],
})
const allowsFor = (name: string) =>
  bodyAllows(sanitySchemaToPortableTextSchema(compiled.get(name) as ArraySchemaType<unknown>))

describe('bodyAllows', () => {
  it('allows everything the room offers in the template’s body', () => {
    const allows = allowsFor('body')
    expect(['image', 'embed', 'codeBlock', 'sectionBreak'].every(allows.block)).toBe(true)
    expect(allows.blockField('image', 'alt')).toBe(true)
    expect(matchCommands('', allows).map((command) => command.id)).toEqual([
      'image',
      'embed',
      'codeBlock',
      'sectionBreak',
      'quote',
      'bulletList',
      'numberList',
    ])
  })

  it('offers only what Chipter’s blockContent can store', () => {
    const allows = allowsFor('blockContent')
    expect(allows.style('h2') && allows.style('blockquote') && allows.list('bullet')).toBe(true)
    expect(allows.decorator('strong') && allows.annotation('link')).toBe(true)
    expect(allows.list('number') || allows.block('embed') || allows.block('codeBlock')).toBe(false)
    expect(allows.blockField('image', 'alt')).toBe(false)
    expect(matchCommands('', allows).map((command) => command.id)).toEqual(['image', 'quote', 'bulletList'])
    expect(matchCommands('list', allows).map((command) => command.id)).toEqual(['bulletList'])
  })
})
