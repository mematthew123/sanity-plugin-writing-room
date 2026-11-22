import {defineConfig} from 'vitest/config'

// Calls the model, so `pnpm test` never runs it.
export default defineConfig({
  test: {include: ['scripts/sorting-eval.ts'], silent: false},
})
