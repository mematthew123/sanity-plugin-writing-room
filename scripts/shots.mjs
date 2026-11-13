// `pnpm shots [--out <folder>] [playwright options]`: captures of the room, written to <folder>
// (default: ./shots/out, which git ignores). The site keeps them in its own repository:
//   pnpm shots --out ../writingroom-studio/src/assets/shots
import {spawnSync} from 'node:child_process'
import {resolve} from 'node:path'

const args = process.argv.slice(2)
const at = args.indexOf('--out')
const out = resolve(at === -1 ? 'shots/out' : (args.splice(at, 2)[1] ?? 'shots/out'))

const run = spawnSync('pnpm', ['exec', 'playwright', 'test', '-c', 'playwright.shots.config.ts', ...args], {
  stdio: 'inherit',
  env: {...process.env, SHOTS_OUT: out},
})
if (run.status === 0) console.log(`\nCaptures are in ${out}`)
process.exit(run.status ?? 1)
