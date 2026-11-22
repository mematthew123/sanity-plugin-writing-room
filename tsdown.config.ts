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
    // The Sorting route runs on a server, never in the Studio. `ai` stays an import: it is an
    // optional peer, needed only by a Studio that hosts the route.
    entry: {sorting: 'src/sorting/index.ts'},
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    dts: true,
    sourcemap: true,
    clean: false,
  },
])
