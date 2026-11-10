import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
// The plugin straight from source, so edits under src/ reload as you save. The Studio and the
// plugin share this repository's node_modules, so there's one copy of Sanity's App SDK.
import {writingRoom, writingRoomSchemaTypes} from './src'
import {writingRoomTheme} from './src/theme'

const projectId = process.env.SANITY_STUDIO_PROJECT_ID
const dataset = process.env.SANITY_STUDIO_DATASET || 'production'
if (!projectId) throw new Error('Missing SANITY_STUDIO_PROJECT_ID. Copy .env.example to .env.local and fill it in.')

export default defineConfig({
  name: 'dev',
  title: 'Writing Room (dev)',
  projectId,
  dataset,
  plugins: [
    structureTool(),
    writingRoom({
      types: ['post'],
      // Optional: set SANITY_STUDIO_PREVIEW_ORIGIN to try Preview against a site that has a
      // draft-mode route (e.g. Calm Editor's Reading Site on http://localhost:3000).
      preview: process.env.SANITY_STUDIO_PREVIEW_ORIGIN
        ? {origin: process.env.SANITY_STUDIO_PREVIEW_ORIGIN}
        : undefined,
    }),
  ],
  schema: {types: writingRoomSchemaTypes},
  theme: writingRoomTheme,
})
