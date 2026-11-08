import {CodeBlockIcon} from '@sanity/icons/CodeBlock'
import {defineField, defineType} from 'sanity'

export const CODE_LANGUAGES = [
  {title: 'Plain text', value: 'text'},
  {title: 'JavaScript', value: 'javascript'},
  {title: 'TypeScript', value: 'typescript'},
  {title: 'HTML', value: 'html'},
  {title: 'CSS', value: 'css'},
  {title: 'Python', value: 'python'},
  {title: 'Shell', value: 'shell'},
]

export const codeBlock = defineType({
  name: 'codeBlock',
  title: 'Code Block',
  type: 'object',
  icon: CodeBlockIcon,
  fields: [
    defineField({
      name: 'code',
      type: 'text',
      rows: 8,
      validation: (rule) => rule.required().warning('This Code Block is empty.'),
    }),
    defineField({
      name: 'language',
      type: 'string',
      options: {list: CODE_LANGUAGES},
      initialValue: 'text',
    }),
  ],
  preview: {
    select: {code: 'code', language: 'language'},
    prepare({code, language}) {
      return {
        title: code?.split('\n').find((line: string) => line.trim()) || 'Empty Code Block',
        subtitle: CODE_LANGUAGES.find((l) => l.value === language)?.title ?? 'Code',
      }
    },
  },
})
