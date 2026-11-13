#!/usr/bin/env node
/**
 * Installs the packed plugin into a fresh Studio and checks it installs, dedupes, type-checks and
 * builds (also inside Next.js with `--embedded`).
 *
 * Usage: node scripts/smoke-test.mjs [sanity-version] [--loose] [--embedded]
 * `--loose` ignores the plugin's peer range, to test whether it could be widened.
 */
import {execFileSync} from 'node:child_process'
import {existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join, resolve} from 'node:path'

const args = process.argv.slice(2)
const loose = args.includes('--loose')
const embedded = args.includes('--embedded')
const sanityVersion = args.find((arg) => !arg.startsWith('--')) ?? 'latest'
const pluginDir = resolve(import.meta.dirname, '..')
const studioDir = mkdtempSync(join(tmpdir(), 'writing-room-smoke-'))
const FORM_EXPORTS = [
  'ALL_FIELDS_GROUP',
  'FormBuilder',
  'createPatchChannel',
  'useDocumentForm',
  'useSyncState',
  'isArrayOfPrimitivesInputProps',
  'isBooleanInputProps',
  'isNumberInputProps',
  'isObjectInputProps',
  'isStringInputProps',
]
const SHARED = ['@sanity/sdk-react', '@sanity/sdk', '@portabletext/editor', 'react', 'styled-components']

function run(command, args, cwd) {
  console.log(`\n$ ${command} ${args.join(' ')}`)
  execFileSync(command, args, {cwd, stdio: 'inherit', env: {...process.env, CI: 'true'}})
}

// 1. Pack.
const packOutput = execFileSync('pnpm', ['pack', '--pack-destination', studioDir], {
  cwd: pluginDir,
  encoding: 'utf8',
})
const tarball = packOutput.trim().split('\n').pop().trim()
if (!existsSync(tarball)) throw new Error(`pnpm pack didn't produce a tarball: ${packOutput}`)

// 2. A minimal Studio, following the README.
const files = {
  'package.json': JSON.stringify(
    {
      name: 'writing-room-smoke',
      private: true,
      type: 'module',
      dependencies: {
        'sanity': sanityVersion,
        'sanity-plugin-writing-room': `file:${tarball}`,
        'react': '^19.3.1',
        'react-dom': '^19.3.1',
        'styled-components': '^6.1.18',
        '@sanity/themer': '^0.10.6',
      },
      devDependencies: {'typescript': '~6.0', '@types/react': '^19.2.14', '@types/node': '^22'},
    },
    null,
    2,
  ),
  // Needed for --embedded; a standalone Studio ignores it.
  'sanity.config.ts': `'use client'

import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {writingRoom, writingRoomSchemaTypes} from 'sanity-plugin-writing-room'
import {writingRoomTheme} from 'sanity-plugin-writing-room/theme'

export default defineConfig({
  projectId: 'abc12345',
  dataset: 'production',
  plugins: [structureTool(), writingRoom({types: ['post'], preview: {origin: 'http://localhost:3000'}})],
  schema: {types: writingRoomSchemaTypes},
  theme: writingRoomTheme,
})
`,
  'sanity.cli.ts': `import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  api: {projectId: 'abc12345', dataset: 'production'},
  deployment: {autoUpdates: false},
})
`,
  'tsconfig.json': JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      lib: ['dom', 'esnext'],
      module: 'Preserve',
      moduleResolution: 'bundler',
      jsx: 'preserve',
      strict: true,
      skipLibCheck: true,
      noEmit: true,
    },
    include: ['*.ts'],
  }),
}
for (const [name, content] of Object.entries(files)) writeFileSync(join(studioDir, name), content)
console.log(`Studio fixture: ${studioDir} (sanity@${sanityVersion})`)

// 3. Install like a user: npm, strict about peers.
run(
  'npm',
  ['install', '--no-audit', '--no-fund', loose ? '--legacy-peer-deps' : '--strict-peer-deps'],
  studioDir,
)

// 4. One copy of everything the plugin shares with Sanity.
function findCopies(name, dir = join(studioDir, 'node_modules'), found = []) {
  for (const entry of readdirSync(dir, {withFileTypes: true})) {
    if (!entry.isDirectory()) continue
    const path = join(dir, entry.name)
    if (entry.name.startsWith('@')) {
      findCopies(name, path, found)
      continue
    }
    const manifest = join(path, 'package.json')
    if (existsSync(manifest)) {
      const pkg = JSON.parse(readFileSync(manifest, 'utf8'))
      if (pkg.name === name) found.push(`${pkg.version} at ${path.slice(studioDir.length)}`)
    }
    const nested = join(path, 'node_modules')
    if (existsSync(nested)) findCopies(name, nested, found)
  }
  return found
}
let duplicated = false
for (const name of SHARED) {
  const copies = findCopies(name)
  console.log(`${name}: ${copies.join(', ') || 'missing'}`)
  if (copies.length !== 1) duplicated = true
}
if (duplicated) {
  console.error('\n✗ Expected exactly one copy of each shared package.')
  process.exit(1)
}

// A second copy means the plugin's range has drifted from Sanity's. Only reported with --loose.
const portableText = readdirSync(join(studioDir, 'node_modules', '@portabletext'))
  .map((name) => [`@portabletext/${name}`, findCopies(`@portabletext/${name}`)])
  .filter(([, copies]) => new Set(copies.map((copy) => copy.split(' ')[0])).size > 1)
console.log(
  portableText.length
    ? `\n@portabletext packages at more than one version:\n${portableText.map(([name, copies]) => `  ${name}: ${copies.join(', ')}`).join('\n')}`
    : '\nEvery @portabletext package is at a single version.',
)
if (portableText.length && !loose) {
  console.error('\n✗ Widen the plugin\'s range for these so it can share Sanity\'s copy.')
  process.exit(1)
}

// 5. The Details view is built on parts of Sanity's form that aren't all stable API.
const sanityExports = execFileSync(
  'node',
  ['--input-type=module', '-e', "import * as sanity from 'sanity'; console.log(Object.keys(sanity).join(','))"],
  {cwd: studioDir, encoding: 'utf8'},
).split(',')
const missing = FORM_EXPORTS.filter((name) => !sanityExports.includes(name))
console.log(`\nForm exports the Details view needs: ${missing.length ? `missing ${missing.join(', ')}` : 'all present'}`)
if (missing.length) {
  console.error(`\n✗ sanity@${sanityVersion} doesn't export what the Details view is built on.`)
  process.exit(1)
}

// 6. Types and bundle.
run('npx', ['tsc', '--noEmit'], studioDir)
run('npx', ['sanity', 'build', '--yes'], studioDir)
expectOneSdk(join(studioDir, 'dist'), 'the Studio bundle')

// 7. The same Studio embedded in a Next.js app.
if (embedded) {
  const next = {
    'next.config.mjs': 'export default {}\n',
    'app/layout.tsx': `export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
`,
    'app/studio/[[...tool]]/page.tsx': `import {NextStudio} from 'next-sanity/studio'
import config from '../../../sanity.config'

export const dynamic = 'force-static'
export {metadata, viewport} from 'next-sanity/studio'

export default function StudioPage() {
  return <NextStudio config={{...config, basePath: '/studio'}} />
}
`,
  }
  for (const [name, content] of Object.entries(next)) {
    mkdirSync(dirname(join(studioDir, name)), {recursive: true})
    writeFileSync(join(studioDir, name), content)
  }
  run(
    'npm',
    ['install', '--no-audit', '--no-fund', loose ? '--legacy-peer-deps' : '--strict-peer-deps', 'next@^16', 'next-sanity@^13'],
    studioDir,
  )
  execFileSync('npx', ['next', 'build'], {
    cwd: studioDir,
    stdio: 'inherit',
    env: {...process.env, CI: 'true', NEXT_TELEMETRY_DISABLED: '1'},
  })
  // Browser bundle only: .next/server has its own copy.
  expectOneSdk(join(studioDir, '.next', 'static'), 'the Next.js browser bundle')
}

console.log(
  `\n✓ sanity@${sanityVersion}: installed, deduped, type-checked and built${embedded ? ', standalone and embedded in Next.js' : ''}.`,
)

/** Each copy of @sanity/sdk-react carries this error message, so two copies means it appears twice. */
function expectOneSdk(dir, label) {
  const MESSAGE = 'wrapped in a ResourceProvider or a SanityApp component'
  let count = 0
  const walk = (path) => {
    for (const entry of readdirSync(path, {withFileTypes: true})) {
      const child = join(path, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== 'cache') walk(child)
      } else if (entry.name.endsWith('.js')) {
        count += readFileSync(child, 'utf8').split(MESSAGE).length - 1
      }
    }
  }
  walk(dir)
  console.log(`App SDK copies in ${label}: ${count}`)
  if (count !== 1) {
    console.error(`\n✗ Expected one copy of @sanity/sdk-react in ${label}, found ${count}.`)
    process.exit(1)
  }
}
