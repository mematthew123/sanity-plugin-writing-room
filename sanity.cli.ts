import {defineCliConfig} from 'sanity/cli'

/**
 * The dev Studio (`pnpm dev`): sanity.config.ts in this folder, which uses the plugin from src/.
 * Not part of the package (see `files` in package.json). Don't run `sanity build` here: it writes
 * to dist/, which is the plugin's own build output.
 */

export default defineCliConfig({
  api: {
    projectId: process.env.SANITY_STUDIO_PROJECT_ID,
    dataset: process.env.SANITY_STUDIO_DATASET || 'production',
  },
  // Off, as every Studio using the plugin needs (see the README's Install section).
  deployment: {autoUpdates: false},
})
