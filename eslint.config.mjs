import studio from '@sanity/eslint-config-studio'

export default [
  {ignores: ['dist', 'playwright-report', 'test-results']},
  ...studio,
  {
    // Playwright reads a fixture's dependencies from its first argument, so it has to be a pattern.
    files: ['e2e/**/*.ts'],
    rules: {'no-empty-pattern': 'off'},
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {globals: {console: 'readonly', process: 'readonly'}},
  },
]
