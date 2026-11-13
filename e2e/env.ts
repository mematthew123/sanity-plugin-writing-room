import {existsSync} from 'node:fs'

if (existsSync('.env.local')) process.loadEnvFile('.env.local')

export const projectId = process.env.SANITY_STUDIO_PROJECT_ID
/** No default: the tests write and delete documents, so the dataset is always one somebody chose. */
export const dataset = process.env.SANITY_STUDIO_DATASET
export const token = process.env.SANITY_E2E_TOKEN
export const studioUrl = process.env.SANITY_E2E_STUDIO_URL || 'http://localhost:3333'

const unset = [
  !projectId && 'SANITY_STUDIO_PROJECT_ID',
  !dataset && 'SANITY_STUDIO_DATASET',
  !token && 'SANITY_E2E_TOKEN',
].filter(Boolean)

/** What's missing before the browser tests can run, as a sentence; null when everything is there. */
export const missing =
  unset.length > 0 ? `Set ${unset.join(' and ')} in .env.local to run the browser tests (see .env.example).` : null
