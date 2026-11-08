import {AsteriskIcon} from '@sanity/icons/Asterisk'
import {defineField, defineType} from 'sanity'

/**
 * A deliberate pause between movements of a Post. It carries no content of its own;
 * Sanity objects need at least one field, so `kind` exists only to satisfy that.
 */
export const sectionBreak = defineType({
  name: 'sectionBreak',
  title: 'Section Break',
  type: 'object',
  icon: AsteriskIcon,
  fields: [
    defineField({
      name: 'kind',
      type: 'string',
      hidden: true,
      readOnly: true,
      initialValue: 'break',
    }),
  ],
  preview: {
    prepare: () => ({title: '✦ ✦ ✦', subtitle: 'Section Break'}),
  },
})
