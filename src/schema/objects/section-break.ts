import {AsteriskIcon} from '@sanity/icons/Asterisk'
import {defineField, defineType} from 'sanity'

/** `kind` exists only because Sanity objects need at least one field. */
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
