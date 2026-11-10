import {sanitySchemaToPortableTextSchema} from '@portabletext/sanity-bridge'
import {type ArraySchemaType, createSchema} from 'sanity'
import {describe, expect, it} from 'vitest'
import {schemaTypes} from '../../schema'
import {bodyNodes} from './nodes'

const compiled = createSchema({
  name: 'test',
  types: [
    ...schemaTypes,
    {
      name: 'richBody',
      type: 'array',
      of: [
        {type: 'block'},
        {type: 'image'},
        {name: 'callout', title: 'Callout', type: 'object', fields: [{name: 'text', type: 'string'}]},
      ],
    },
  ],
})
const typesOf = (name: string) =>
  bodyNodes(sanitySchemaToPortableTextSchema(compiled.get(name) as ArraySchemaType<unknown>)).map(
    (node) => (node as {type?: string}).type,
  )

describe('bodyNodes', () => {
  it('adds nothing for a body the room knows all of', () => {
    expect(typesOf('body')).not.toContain('callout')
  })

  it('gives a Studio’s own block types a placeholder, so they keep their place', () => {
    expect(typesOf('richBody')).toContain('callout')
    expect(typesOf('richBody').filter((type) => type === 'image')).toHaveLength(1)
  })
})
