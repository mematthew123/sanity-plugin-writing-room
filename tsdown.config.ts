import {defineConfig} from 'tsdown'
import {roomStyles} from './css-modules.config.ts'

export default defineConfig([
  {
    entry: ['src/index.ts', 'src/theme.ts'],
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    dts: true,
    sourcemap: true,
    clean: true,
    // Inlined so Studios need no font packages or font loader.
    loader: {'.woff2': 'dataurl'},
    // The plugin handles CSS; tsdown's own would emit a stylesheet.
    css: false,
    plugins: [roomStyles()],
  },
  {
    // Server-only. `ai` stays an import: an optional peer.
    entry: {sorting: 'src/sorting/index.ts'},
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    dts: true,
    sourcemap: true,
    clean: false,
  },
])
