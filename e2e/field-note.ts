import {defineField, defineType} from 'sanity'

/** Something a Field Note can point to, so Sorting has answers to pick among. */
export const topic = defineType({
  name: 'topic',
  title: 'Topic',
  type: 'document',
  fields: [defineField({name: 'title', type: 'string'})],
})

/**
 * A second kind of writing for the dev Studio, so the browser tests have what the starter Post
 * doesn't: a number, a switch, a date, a list of choices, a list of references and a Details
 * field that blocks a publish.
 */
export const fieldNote = defineType({
  name: 'fieldNote',
  title: 'Field Note',
  type: 'document',
  fields: [
    defineField({name: 'title', type: 'string'}),
    defineField({name: 'body', type: 'body'}),
    defineField({
      name: 'summary',
      type: 'text',
      rows: 2,
      validation: (rule) => rule.required().error('Every Field Note needs a summary.'),
    }),
    defineField({name: 'rating', type: 'number'}),
    defineField({name: 'featured', type: 'boolean'}),
    defineField({name: 'day', type: 'date'}),
    defineField({name: 'mood', type: 'string', options: {list: ['calm', 'restless']}}),
    defineField({name: 'topics', type: 'array', of: [{type: 'reference', to: [{type: 'topic'}]}]}),
  ],
})
