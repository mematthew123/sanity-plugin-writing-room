import {defineConfig} from 'tsdown'

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
