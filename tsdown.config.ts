import {defineConfig} from 'tsdown'

/**
 * Builds the npm package. Dependencies and peer dependencies stay external; the private
 * workspace packages (`@calm/content`, `@calm/tokens`) are dev dependencies, so they're bundled
 * into `dist` and consumers never need them.
 */
export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  dts: true,
  sourcemap: true,
  clean: true,
})
