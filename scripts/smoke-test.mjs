#!/usr/bin/env node
/**
 * Installs the packed plugin into a brand-new Studio, the way a user would, and checks it:
 *
 *   1. `npm install` succeeds with no peer-dependency conflicts,
 *   2. there's exactly one copy of each package the plugin must share with Sanity,
 *   3. `sanity.config.ts` type-checks against the published types,
 *   4. `sanity build` bundles the Studio.
 *
 * Usage: node scripts/smoke-test.mjs [sanity-version] [--loose]
 *   e.g. node scripts/smoke-test.mjs 6.15.0
 * The version defaults to `latest`. `--loose` installs even when that version is outside the
 * plugin's declared peer range, to find out whether the range could be widened.
 *
 * It can't open the Writing Room itself: that needs a logged-in Studio.
 */
import {execFileSync} from 'node:child_process'
import {mkdtempSync, readdirSync, readFileSync, writeFileSync, existsSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'

const args = process.argv.slice(2)
const loose = args.includes('--loose')
const sanityVersion = args.find((arg) => !arg.startsWith('--')) ?? 'latest'
const pluginDir = resolve(import.meta.dirname, '..')
const studioDir = mkdtempSync(join(tmpdir(), 'writing-room-smoke-'))
const SHARED = ['@sanity/sdk-react', '@sanity/sdk', '@portabletext/editor', 'react', 'styled-components']

function run(command, args, cwd) {
  console.log(`\n$ ${command} ${args.join(' ')}`)
  execFileSync(command, args, {cwd, stdio: 'inherit', env: {...process.env, CI: 'true'}})
}

// 1. Pack the plugin exactly as npm would publish it.
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
      },
      devDependencies: {'typescript': '~6.0', '@types/react': '^19.2.14'},
    },
    null,
    2,
  ),
  'sanity.config.ts': `import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {writingRoom, writingRoomSchemaTypes} from 'sanity-plugin-writing-room'

export default defineConfig({
  projectId: 'abc12345',
  dataset: 'production',
  plugins: [structureTool(), writingRoom({preview: {origin: 'http://localhost:3000'}})],
  schema: {types: writingRoomSchemaTypes},
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

// 5. Types and bundle.
run('npx', ['tsc', '--noEmit'], studioDir)
run('npx', ['sanity', 'build', '--yes'], studioDir)

console.log(`\n✓ sanity@${sanityVersion}: installed, deduped, type-checked and built.`)
