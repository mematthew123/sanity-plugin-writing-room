import {defineField, defineType} from 'sanity'

/**
 * A second kind of writing for the dev Studio, so the browser tests have what the starter Post
 * doesn't: a number, a switch, a date, a list of choices and a Details field that blocks a publish.
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
  ],
})
