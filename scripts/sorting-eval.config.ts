import {defineConfig} from 'vitest/config'

// Only for `pnpm sorting:eval`. It calls the model, so `pnpm test` never runs it.
export default defineConfig({
  test: {include: ['scripts/sorting-eval.ts'], silent: false},
})
