import {defineConfig, devices} from '@playwright/test'
import {studioUrl} from './e2e/env'

/**
 * `pnpm shots`: captures of the room for writingroom.studio, from the dev Studio in this
 * repository. Not tests: nothing here asserts how the room behaves. See shots/capture.shots.ts.
 */
const window = {viewport: {width: 1440, height: 900}, deviceScaleFactor: 2}

export default defineConfig({
  testDir: 'shots',
  testMatch: '**/*.shots.ts',
  outputDir: 'test-results/shots',
  // One at a time: each capture wants the machine to itself, and the loop records in real time.
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  timeout: 120_000,
  expect: {timeout: 20_000},
  use: {baseURL: studioUrl, trace: 'off'},
  projects: [
    {name: 'dark', use: {...devices['Desktop Chrome'], ...window, colorScheme: 'dark'}},
    {name: 'light', use: {...devices['Desktop Chrome'], ...window, colorScheme: 'light'}},
  ],
  webServer: {
    command: 'pnpm dev',
    url: studioUrl,
    reuseExistingServer: true,
    // Where the publish capture says the Post will go live. A dev Studio that is already running
    // keeps its own; stop it first if that matters.
    env: {SANITY_STUDIO_PREVIEW_ORIGIN: 'https://demo.writingroom.studio'},
    stderr: 'ignore',
    timeout: 120_000,
  },
})
