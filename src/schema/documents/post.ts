import {DocumentTextIcon} from '@sanity/icons/DocumentText'
import {defineField, defineType, type SlugIsUniqueValidator} from 'sanity'
import {API_VERSION} from '../../lib/api-version'

/**
 * Until a Post's first publish its slug follows the title, and publishing settles any clash
 * (`notes` → `notes-2`), so a clash isn't an error yet. Flagging it would disable Publish before
 * that settling could run. Once published, the slug stays put and must be unique.
 */
const isUniqueOncePublished: SlugIsUniqueValidator = async (slug, context) => {
  const id = context.document?._id.replace(/^(drafts|versions\.[^.]+)\./, '')
  if (!id) return context.defaultIsUnique(slug, context)
  const isPublished = await context
    .getClient({apiVersion: API_VERSION})
    .fetch<boolean>('defined(*[_id == $id][0]._id)', {id})
  return isPublished ? context.defaultIsUnique(slug, context) : true
}

/**
 * A Post. Only Prose (title, body) may block publishing; every Detail is optional
 * and the Reading Site supplies a fallback. Writers publish from the Writing Room, which can't
 * show Details, so a required Detail would block a publish they can't fix from where they are.
 * Don't add required validation to anything in the `details` group without giving the room a
 * way to resolve it in place.
 */
export const post = defineType({
  name: 'post',
  type: 'document',
  icon: DocumentTextIcon,
  groups: [
    {name: 'prose', title: 'Prose', default: true},
    {name: 'details', title: 'Details'},
  ],
  fields: [
    defineField({
      name: 'title',
      type: 'string',
      group: 'prose',
      validation: (rule) => rule.required().error('Every Post needs a title.'),
    }),
    defineField({
      name: 'body',
      type: 'body',
      group: 'prose',
    }),
    defineField({
      name: 'slug',
      type: 'slug',
      group: 'details',
      description: 'Follows the title until the Post is first published, then stays put.',
      options: {source: 'title', maxLength: 96, isUnique: isUniqueOncePublished},
    }),
    defineField({
      name: 'excerpt',
      type: 'text',
      rows: 3,
      group: 'details',
      description:
        'A sentence or two for previews and social cards. Leave empty to use the opening of the Post.',
      validation: (rule) =>
        rule.max(200).warning('Short excerpts read best: aim for under 200 characters.'),
    }),
    defineField({
      name: 'coverImage',
      type: 'image',
      group: 'details',
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
              return 'A description helps people who can’t see the image.'
            }).warning(),
        }),
      ],
    }),
    defineField({
      name: 'publishedAt',
      title: 'Published date',
      type: 'datetime',
      group: 'details',
      description: 'Set automatically the first time this Post is published. Change it to backdate.',
    }),
    defineField({
      name: 'tags',
      type: 'array',
      group: 'details',
      of: [{type: 'string'}],
      options: {layout: 'tags'},
      validation: (rule) => rule.unique(),
    }),
  ],
  orderings: [
    {
      title: 'Recently published',
      name: 'publishedAtDesc',
      by: [{field: 'publishedAt', direction: 'desc'}],
    },
  ],
  preview: {
    select: {title: 'title', media: 'coverImage', excerpt: 'excerpt'},
    prepare: ({title, media, excerpt}) => ({
      title: title || 'Untitled',
      subtitle: excerpt,
      media,
    }),
  },
})
