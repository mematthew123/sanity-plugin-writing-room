import {defineField, defineType} from 'sanity'

/** The fields every one of these has, so the room has a slug to settle and a date to stamp. */
const slug = defineField({name: 'slug', type: 'slug', options: {source: 'title', maxLength: 96}})
const publishedAt = defineField({name: 'publishedAt', title: 'Published date', type: 'datetime'})

const locks = (lock: string) => (context: {document?: Record<string, unknown>}) => context.document?.lock === lock

/**
 * A note whose `readOnly` rules follow one of its own fields, so each lock the schema can put on
 * the room is a choice in Details: the title, the body, the slug and date, or the whole document.
 * Publish is left alone. Once everything is locked the choice is too; "Open for changes" in the
 * form's menu lifts it (see e2e/lock-note-actions.tsx).
 */
export const lockedNote = defineType({
  name: 'lockedNote',
  title: 'Locked Note',
  type: 'document',
  readOnly: locks('everything'),
  fields: [
    defineField({name: 'title', type: 'string', readOnly: locks('title')}),
    defineField({name: 'body', type: 'body', readOnly: locks('body')}),
    defineField({...slug, readOnly: locks('details')}),
    defineField({...publishedAt, readOnly: locks('details')}),
    defineField({
      name: 'lock',
      title: 'What is locked',
      type: 'string',
      options: {
        layout: 'radio',
        list: [
          {title: 'The title', value: 'title'},
          {title: 'The body', value: 'body'},
          {title: 'The slug and the published date', value: 'details'},
          {title: 'Everything', value: 'everything'},
        ],
      },
    }),
  ],
})

/**
 * A note with actions of its own in Publish's place: "Request review", then "Approve", which
 * locks it. Approved, it can be published as it is; published, its button is "Reopen", which
 * opens it for changes again. `ask` picks the dialog Request review opens, so each kind can be
 * tried in the room. The status is only ever set by the actions.
 */
export const reviewNote = defineType({
  name: 'reviewNote',
  title: 'Review Note',
  type: 'document',
  readOnly: ({document}) => document?.status === 'approved',
  fields: [
    defineField({name: 'title', type: 'string'}),
    defineField({name: 'body', type: 'body'}),
    slug,
    publishedAt,
    defineField({
      name: 'status',
      type: 'string',
      readOnly: true,
      options: {
        list: [
          {title: 'In review', value: 'inReview'},
          {title: 'Approved', value: 'approved'},
        ],
      },
    }),
    defineField({
      name: 'ask',
      title: 'How Request review asks',
      type: 'string',
      description: 'Empty: it doesn’t ask.',
      options: {
        layout: 'radio',
        list: [
          {title: 'A confirm', value: 'confirm'},
          {title: 'A popover', value: 'popover'},
          {title: 'A dialog', value: 'dialog'},
          {title: 'A dialog of its own making', value: 'custom'},
        ],
      },
    }),
  ],
})

/** A note whose Studio took Publish away and put nothing in its place: the room has no button. */
export const noPublishNote = defineType({
  name: 'noPublishNote',
  title: 'No-Publish Note',
  type: 'document',
  fields: [defineField({name: 'title', type: 'string'}), defineField({name: 'body', type: 'body'}), slug, publishedAt],
})

/** A note whose first action only runs in the form: the room offers Open in Structure instead. */
export const formOnlyNote = defineType({
  name: 'formOnlyNote',
  title: 'Form-Only Note',
  type: 'document',
  fields: [defineField({name: 'title', type: 'string'}), defineField({name: 'body', type: 'body'}), slug, publishedAt],
})

export const lockNotes = [lockedNote, reviewNote, noPublishNote, formOnlyNote]
