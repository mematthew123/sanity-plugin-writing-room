import {defineConfig, devices} from '@playwright/test'
import {studioUrl} from './e2e/env'

/**
 * `pnpm vrt`: run through scripts/vrt.mjs, not on its own. The Sanity project only answers the
 * origins it knows (http://localhost:3333), so the base Studio listens on its own port and the
 * browser is sent there whenever a page asks for the usual one.
 */
const usual = new URL(studioUrl)
const basePort = process.env.VRT_BASE_PORT
const toBase = basePort ? [`--host-resolver-rules=MAP ${usual.host} ${usual.hostname}:${basePort}`] : []

const windows = {
  desktop: {viewport: {width: 1280, height: 800}},
  phone: {viewport: {width: 390, height: 780}, hasTouch: true},
}

export default defineConfig({
  testDir: 'vrt',
  testMatch: '**/*.vrt.ts',
  outputDir: 'test-results/vrt',
  globalSetup: './shots/global-setup.ts',
  fullyParallel: true,
  workers: 4,
  // A dev Studio's first page is slow while Vite gathers its dependencies.
  retries: 1,
  reporter: [['list']],
  timeout: 120_000,
  expect: {timeout: 20_000},
  use: {baseURL: studioUrl, trace: 'off'},
  projects: (['base', 'candidate'] as const).flatMap((side) =>
    (['desktop', 'phone'] as const).flatMap((window) =>
      (['light', 'dark'] as const).map((colorScheme) => ({
        name: `${side}-${window}-${colorScheme}`,
        use: {
          ...devices['Desktop Chrome'],
          ...windows[window],
          colorScheme,
          launchOptions: {args: side === 'base' ? toBase : []},
        },
      })),
    ),
  ),
})
