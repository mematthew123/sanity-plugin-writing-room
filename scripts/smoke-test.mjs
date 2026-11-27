#!/usr/bin/env node
/**
 * Installs the packed plugin into a fresh Studio and checks it installs, dedupes, type-checks and
 * builds with its styles (also inside Next.js with `--embedded`).
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
  'ChangeIndicatorsTracker',
  'FormBuilder',
  'createPatchChannel',
  'useDocumentForm',
  // For arrays in Details.
  'VirtualizerScrollInstanceProvider',
  'CopyPasteProvider',
  // For references in Details.
  'ReferenceInputOptionsProvider',
  // For the image sources the Insert Menu offers.
  'useSource',
  'useSyncState',
  'isArrayOfPrimitivesInputProps',
  'isBooleanInputProps',
  'isNumberInputProps',
  'isObjectInputProps',
  'isStringInputProps',
  'useActiveReleases',
  'useDocumentVersions',
  'useFeatureEnabled',
  'useScheduledDraftsEnabled',
]
const SHARED = ['@sanity/sdk-react', '@sanity/sdk', '@portabletext/editor', 'react']

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

// The room's styles are plain CSS; `pnpm pack` has just rebuilt dist/.
const distDir = join(pluginDir, 'dist')
const styledIn = readdirSync(distDir).filter(
  (file) => /\.(js|d\.ts)$/.test(file) && readFileSync(join(distDir, file), 'utf8').includes('styled-components'),
)
if (styledIn.length) {
  console.error(`\n✗ The plugin reaches for styled-components again: ${styledIn.join(', ')}`)
  process.exit(1)
}

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
        // Sanity's own peer, not the plugin's.
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

// A version Sanity doesn't install itself means the plugin's range has drifted from Sanity's.
// Sanity's command-line tools keep copies of their own, which never reach the Studio's bundle.
const TOOLING = ['@sanity/cli', '@sanity/runtime-cli']
const inTheStudio = (copy) => !TOOLING.some((name) => copy.includes(`/node_modules/${name}/node_modules/`))

/** Every `name@version` that `from` loads, found the way Node would. */
function reachable(from, seen = new Set(), visited = new Set()) {
  if (visited.has(from)) return seen
  visited.add(from)
  const pkg = JSON.parse(readFileSync(join(from, 'package.json'), 'utf8'))
  seen.add(`${pkg.name}@${pkg.version}`)
  for (const name of Object.keys({...pkg.dependencies, ...pkg.peerDependencies})) {
    for (let dir = from; dir.startsWith(studioDir); dir = dirname(dir)) {
      const candidate = join(dir, 'node_modules', name)
      if (existsSync(join(candidate, 'package.json'))) {
        reachable(candidate, seen, visited)
        break
      }
    }
  }
  return seen
}

// Sanity can be at two versions of a package by itself; that isn't the plugin's to fix.
const sanityLoads = reachable(join(studioDir, 'node_modules', 'sanity'))
const split = readdirSync(join(studioDir, 'node_modules', '@portabletext'))
  .map((name) => [`@portabletext/${name}`, findCopies(`@portabletext/${name}`).filter(inTheStudio)])
  .filter(([, copies]) => new Set(copies.map((copy) => copy.split(' ')[0])).size > 1)
const list = (packages) => packages.map(([name, copies]) => `  ${name}: ${copies.join(', ')}`).join('\n')
const isSanitys = ([name, copies]) => copies.every((copy) => sanityLoads.has(`${name}@${copy.split(' ')[0]}`))
const sanitys = split.filter(isSanitys)
const portableText = split.filter((entry) => !isSanitys(entry))
if (sanitys.length) console.log(`\nSanity itself installs two versions of:\n${list(sanitys)}`)
console.log(
  portableText.length
    ? `\n@portabletext packages at a version Sanity doesn't install:\n${list(portableText)}`
    : '\nEvery @portabletext package is at a version Sanity installs.',
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
console.log(`\nSanity exports the room needs: ${missing.length ? `missing ${missing.join(', ')}` : 'all present'}`)
if (missing.length) {
  console.error(`\n✗ sanity@${sanityVersion} doesn't export what the room is built on.`)
  process.exit(1)
}

// 6. Types and bundle.
run('npx', ['tsc', '--noEmit'], studioDir)
run('npx', ['sanity', 'build', '--yes'], studioDir)
const studioBundle = scripts(join(studioDir, 'dist'))
expectOneSdk(studioBundle, 'the Studio bundle')
expectRoomStyles(studioBundle, 'the Studio bundle')

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
  const nextBundle = scripts(join(studioDir, '.next', 'static'))
  expectOneSdk(nextBundle, 'the Next.js browser bundle')
  expectRoomStyles(nextBundle, 'the Next.js browser bundle')
}

console.log(
  `\n✓ sanity@${sanityVersion}: installed, deduped, type-checked and built${embedded ? ', standalone and embedded in Next.js' : ''}.`,
)

/** Every script under `dir`, read once for all the checks made of it. */
function scripts(dir, found = []) {
  for (const entry of readdirSync(dir, {withFileTypes: true})) {
    const child = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'cache') scripts(child, found)
    } else if (entry.name.endsWith('.js')) {
      found.push(readFileSync(child, 'utf8'))
    }
  }
  return found
}

/** Each copy of @sanity/sdk-react carries this error message, so two copies means it appears twice. */
function expectOneSdk(all, label) {
  const MESSAGE = 'wrapped in a ResourceProvider or a SanityApp component'
  const count = all.reduce((sum, script) => sum + script.split(MESSAGE).length - 1, 0)
  console.log(`App SDK copies in ${label}: ${count}`)
  if (count !== 1) {
    console.error(`\n✗ Expected one copy of @sanity/sdk-react in ${label}, found ${count}.`)
    process.exit(1)
  }
}

/** Splits at the commas between animations, not those inside a `cubic-bezier()` or a `var()`. */
function animations(value) {
  const found = ['']
  let depth = 0
  for (const char of value) {
    if (char === '(') depth++
    if (char === ')') depth--
    if (char === ',' && depth === 0) found.push('')
    else found[found.length - 1] += char
  }
  return found
}

/** A bundler that dropped the room's CSS as unused would still build. */
function expectRoomStyles(all, label) {
  const rules = all.some((script) => /\.calm-[\w-]+\{/.test(script))
  // The `href` of the `<style>` the room renders them in (WritingRoomTool.tsx).
  const added = all.some((script) => script.includes('sanity-plugin-writing-room/styles-'))
  console.log(`The room's styles in ${label}: ${rules && added ? 'present' : 'missing'}`)
  if (!rules || !added) {
    console.error(`\n✗ ${label} lost the room's CSS${rules ? "'s way onto the page" : ''}.`)
    process.exit(1)
  }
  // Each animation must name a `@keyframes` the build renamed. The stylesheet is one string, so
  // both are in the same script.
  const keyframes = new Set()
  const used = new Set()
  for (const css of all) {
    for (const [, name] of css.matchAll(/@keyframes (calm-[\w-]+)/g)) keyframes.add(name)
    for (const [, declarations] of css.matchAll(/\.calm-[\w-]+[^{}]*\{([^{}]*)\}/g)) {
      for (const [, value] of declarations.matchAll(/(?:^|;)animation(?:-name)?:([^;]+)/g)) used.add(value)
    }
  }
  const stray = new Set()
  for (const value of used) {
    for (const animation of animations(value)) {
      const names = animation.split(/[\s,()]+/)
      if (!names.includes('none') && !names.some((name) => keyframes.has(name))) stray.add(value)
    }
  }
  console.log(`The room's animations in ${label}: ${stray.size ? 'missing their keyframes' : 'matched'}`)
  if (stray.size) {
    console.error(`\n✗ ${label} has animations with no @keyframes: ${[...stray].join(' | ')}`)
    process.exit(1)
  }
}
