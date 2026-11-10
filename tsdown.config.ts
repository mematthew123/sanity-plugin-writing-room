import {defineConfig} from 'tsdown'

/**
 * Builds the npm package. Dependencies and peer dependencies stay external; the private
 * workspace packages (`@calm/content`, `@calm/tokens`) are dev dependencies, so they're bundled
 * into `dist` and consumers never need them.
 */
export default defineConfig({
  entry: ['src/index.ts', 'src/theme.ts'],
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  dts: true,
  sourcemap: true,
  clean: true,
  // The room's fonts go into the package as data URLs (in their own chunk, loaded when the room
  // opens), so Studios need neither the font packages nor a loader for font files.
  loader: {'.woff2': 'dataurl'},
})
