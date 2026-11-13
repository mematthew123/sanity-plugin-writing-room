import {existsSync} from 'node:fs'

if (existsSync('.env.local')) process.loadEnvFile('.env.local')

export const projectId = process.env.SANITY_STUDIO_PROJECT_ID
export const dataset = process.env.SANITY_STUDIO_DATASET || 'production'
export const token = process.env.SANITY_E2E_TOKEN
export const studioUrl = process.env.SANITY_E2E_STUDIO_URL || 'http://localhost:3333'

/** What's missing before the browser tests can run, as a sentence; null when everything is there. */
export const missing =
  !projectId || !token
    ? `Set ${[!projectId && 'SANITY_STUDIO_PROJECT_ID', !token && 'SANITY_E2E_TOKEN'].filter(Boolean).join(' and ')} in .env.local to run the browser tests (see .env.example).`
    : null
