import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
// From source, so edits reload live and the Studio shares one copy of the App SDK.
import {fieldNote} from './e2e/field-note'
import {testPictures} from './e2e/test-pictures'
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
      // The Field Note is there for the browser tests; see e2e/field-note.ts.
      types: ['post', 'fieldNote'],
      // Set SANITY_STUDIO_PREVIEW_ORIGIN to a site with a draft-mode route to try Preview.
      preview: process.env.SANITY_STUDIO_PREVIEW_ORIGIN
        ? {origin: process.env.SANITY_STUDIO_PREVIEW_ORIGIN}
        : undefined,
    }),
  ],
  schema: {types: [...writingRoomSchemaTypes, fieldNote]},
  // A second image source is there for the browser tests; see e2e/test-pictures.tsx.
  form: {image: {assetSources: (previous) => [...previous, testPictures]}},
  theme: writingRoomTheme,
})
