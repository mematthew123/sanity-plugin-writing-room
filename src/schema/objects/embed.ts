import {PlayIcon} from '@sanity/icons/Play'
import {defineField, defineType} from 'sanity'
import {EMBED_PROVIDER_NAMES, parseEmbedUrl} from '@calm/content'

export const embed = defineType({
  name: 'embed',
  type: 'object',
  icon: PlayIcon,
  fields: [
    defineField({
      name: 'url',
      title: 'Link',
      type: 'url',
      description: 'A YouTube, Vimeo or Spotify link.',
      validation: (rule) =>
        rule.required().custom((url) => {
          if (!url) return true
          return parseEmbedUrl(url) ? true : 'This link isn’t from YouTube, Vimeo or Spotify.'
        }),
    }),
    defineField({
      name: 'caption',
      type: 'string',
    }),
  ],
  preview: {
    select: {url: 'url', caption: 'caption'},
    prepare({url, caption}) {
      const parsed = url ? parseEmbedUrl(url) : null
      return {
        title: caption || url || 'Embed',
        subtitle: parsed ? EMBED_PROVIDER_NAMES[parsed.provider] : 'Embed',
      }
    },
  },
})
