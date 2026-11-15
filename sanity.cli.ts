import {defineCliConfig} from 'sanity/cli'
import {cssModules, include} from './css-modules.config.ts'

// Dev Studio only. Don't run `sanity build` here: it would overwrite the plugin's dist/.
export default defineCliConfig({
  api: {
    projectId: process.env.SANITY_STUDIO_PROJECT_ID,
    dataset: process.env.SANITY_STUDIO_DATASET || 'production',
  },
  // Required by the plugin (see the README's Install section).
  deployment: {autoUpdates: false},
  vite: {css: {transformer: 'lightningcss', lightningcss: {cssModules, include}}},
})
