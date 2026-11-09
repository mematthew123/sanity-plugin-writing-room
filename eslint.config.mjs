import studio from '@sanity/eslint-config-studio'

export default [
  {ignores: ['dist']},
  ...studio,
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {globals: {console: 'readonly', process: 'readonly'}},
  },
]
