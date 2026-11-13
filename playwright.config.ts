import {defineConfig, devices} from '@playwright/test'
import {studioUrl} from './e2e/env'

/**
 * Browser tests of the room in a real, logged-in Studio: the dev Studio from this repository,
 * talking to the project and dataset in `.env.local`. They write real documents (ids starting
 * `e2e-`) and remove them again.
 */
export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', {open: 'never'}]] : [['list'], ['html', {open: 'never'}]],
  timeout: 60_000,
  expect: {timeout: 15_000},
  use: {
    baseURL: studioUrl,
    // A trace holds the token the tests sign in with, and CI's report can be downloaded: none there.
    trace: process.env.CI ? 'off' : 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      testIgnore: '**/*.phone.e2e.ts',
      use: {...devices['Desktop Chrome'], viewport: {width: 1280, height: 800}},
    },
    {
      name: 'phone',
      testMatch: '**/*.phone.e2e.ts',
      use: {...devices['Desktop Chrome'], viewport: {width: 390, height: 780}, hasTouch: true},
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: studioUrl,
    reuseExistingServer: true,
    // The dev server repeats the browser's console; locally, a failing test's trace has it anyway.
    stderr: 'ignore',
    timeout: 120_000,
  },
})
