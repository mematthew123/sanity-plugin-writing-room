#!/usr/bin/env node
import {execFileSync, spawn, spawnSync} from 'node:child_process'
import {
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import {createServer} from 'node:net'
import {homedir} from 'node:os'
import {basename, join, relative, resolve} from 'node:path'
import pixelmatch from 'pixelmatch'
import {PNG} from 'pngjs'

const HELP = `pnpm vrt: compare the room on this working tree (the candidate) against a base commit.

It checks the base out into a git worktree it keeps (~/.cache/sanity-plugin-writing-room-vrt/<sha>,
with its own node_modules), starts a dev Studio from each, and captures the room in each of its states (vrt/capture.vrt.ts), in a desktop and a
phone window, light and dark. Two signals per capture:

  styles  the computed style and box of every element, keyed by its position in the DOM and never
          by class name, so it covers the whole page and not just what fits in the window
  pixels  a screenshot of the window

Both Studios use the project and dataset in .env.local, like the browser tests. Each capture seeds
the essay in shots/essay.ts as a draft Post (ids starting \`shots-\`) and removes it afterwards.

Usage
  pnpm vrt [options]

  --base-ref=REF          the commit to compare against (default: where HEAD left main)
  --main=BRANCH           the branch that default is measured from (default: main)
  -g, --grep=PATTERN      only the captures whose name matches, e.g. -g details
  --project=NAME          only this window and scheme, e.g. desktop-light (repeatable)
  --retries=1             capture a differing state again, up to this many times: a real regression
                          differs every time, a slow font or image doesn't
  --pixel-limit=0.001     fail a capture when more than this fraction of its pixels differ
  --pixel-tile-limit=0.25 also fail when more than this fraction of any 32px tile differs, so a
                          small control that changes completely can't hide in a large window
  --base-port=3334        where the base Studio listens
  --reinstall             install the base's dependencies again
  --out=DIR               where reports go (default: vrt/out, which git ignores)

The candidate is the dev Studio at http://localhost:3333: the one already running there, or one
this starts. Exit code 1 when any capture differs, 2 when the comparison couldn't be made.
The report is <out>/<run>/summary.md, with style differences in styles/ and base, candidate and
diff images in pixels/.
`

const repo = resolve(import.meta.dirname, '..')
const TILE = 32
const BOX_TOLERANCE_PX = 0.5
const VARIANTS = ['desktop-light', 'desktop-dark', 'phone-light', 'phone-dark']

function parseArgs(argv) {
  const options = {
    baseRef: null,
    main: 'main',
    grep: null,
    projects: [],
    retries: 1,
    pixelLimit: 0.001,
    pixelTileLimit: 0.25,
    basePort: 3334,
    reinstall: false,
    out: 'vrt/out',
  }
  const number = (value, flag) => {
    const parsed = Number(value)
    if (value === '' || !Number.isFinite(parsed) || parsed < 0) throw new Error(`${flag} needs a number, got "${value}"`)
    return parsed
  }
  for (let index = 0; index < argv.length; index++) {
    const [flag, ...rest] = argv[index].split('=')
    // `-g details` and `--grep details` as well as `--grep=details`.
    const value = rest.length > 0 ? rest.join('=') : ['-g', '--grep', '--project'].includes(flag) ? (argv[++index] ?? '') : ''
    if (flag === '--base-ref') options.baseRef = value
    else if (flag === '--main') options.main = value
    else if (flag === '-g' || flag === '--grep') options.grep = value
    else if (flag === '--project') options.projects.push(value)
    else if (flag === '--retries') options.retries = number(value, flag)
    else if (flag === '--pixel-limit') options.pixelLimit = number(value, flag)
    else if (flag === '--pixel-tile-limit') options.pixelTileLimit = number(value, flag)
    else if (flag === '--base-port') options.basePort = number(value, flag)
    else if (flag === '--reinstall') options.reinstall = true
    else if (flag === '--out') options.out = value
    else throw new Error(`unknown argument ${argv[index]}`)
  }
  for (const project of options.projects) {
    if (!VARIANTS.includes(project)) throw new Error(`--project is one of ${VARIANTS.join(', ')}, got "${project}"`)
  }
  return options
}

function git(args, cwd = repo) {
  return execFileSync('git', args, {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim()
}

const say = (message) => console.error(message)

// --- The two Studios ---

function resolveBaseSha({baseRef, main}) {
  const ref = baseRef ?? git(['merge-base', 'HEAD', main])
  return git(['rev-parse', `${ref}^{commit}`])
}

function run(command, args, cwd, logFile) {
  const log = createWriteStream(logFile)
  return new Promise((done, fail) => {
    const child = spawn(command, args, {cwd})
    child.stdout.pipe(log)
    child.stderr.pipe(log)
    child.on('error', fail)
    child.on('close', (code) => {
      log.end()
      if (code === 0) return done()
      const tail = readFileSync(logFile, 'utf8').split('\n').slice(-25).join('\n')
      fail(new Error(`\`${command} ${args.join(' ')}\` in ${cwd} exited ${code}. Log: ${logFile}\n${tail}`))
    })
  })
}

/**
 * One worktree per base commit, outside the repository: Vite won't serve anything under .git, and
 * the tests and the linter would pick up a copy inside the working tree.
 */
async function ensureBase(sha, logDir, reinstall) {
  const cache = join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'sanity-plugin-writing-room-vrt')
  const dir = join(cache, sha)
  const installed = join(dir, '.vrt-installed')
  const short = sha.slice(0, 9)

  // One base at a time: each is a whole node_modules.
  for (const entry of existsSync(cache) ? readdirSync(cache) : []) {
    if (entry === sha) continue
    say(`base: removing the worktree for ${entry.slice(0, 9)}`)
    try {
      git(['worktree', 'remove', '--force', join(cache, entry)])
    } catch {
      rmSync(join(cache, entry), {recursive: true, force: true})
      git(['worktree', 'prune'])
    }
  }

  if (!existsSync(dir)) {
    say(`base ${short}: checking out a worktree`)
    mkdirSync(cache, {recursive: true})
    git(['worktree', 'prune'])
    git(['worktree', 'add', '--detach', dir, sha])
  }
  // Every run: the project, dataset and token may have changed since the last one.
  copyFileSync(join(repo, '.env.local'), join(dir, '.env.local'))
  if (reinstall || !existsSync(installed)) {
    say(`base ${short}: installing dependencies`)
    rmSync(installed, {force: true})
    await run('pnpm', ['install', '--frozen-lockfile'], dir, join(logDir, 'base-install.log'))
    writeFileSync(installed, new Date().toISOString())
  }
  return dir
}

function portIsFree(port) {
  return new Promise((done) => {
    const probe = createServer()
    probe.once('error', () => done(false))
    // Every address, as the dev server asks for it: a Studio listening on IPv6 alone still counts.
    probe.once('listening', () => probe.close(() => done(true)))
    probe.listen(port)
  })
}

async function answers(url) {
  const response = await fetch(url, {redirect: 'manual'}).catch(() => null)
  return response !== null && response.status < 500
}

async function startStudio(dir, port, logFile) {
  if (!(await portIsFree(port))) throw new Error(`port ${port} is in use: stop what is listening there, or pass --base-port`)
  const log = createWriteStream(logFile)
  const child = spawn('pnpm', ['exec', 'sanity', 'dev', '--port', String(port)], {cwd: dir, detached: true})
  child.stdout.pipe(log)
  child.stderr.pipe(log)
  const stop = () => {
    if (child.pid === undefined || child.exitCode !== null) return
    try {
      // The whole group: pnpm's child is the server.
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      child.kill('SIGTERM')
    }
  }
  const url = `http://localhost:${port}`
  const deadline = Date.now() + 120_000
  while (!(await answers(url))) {
    if (child.exitCode !== null || Date.now() > deadline) {
      stop()
      const tail = existsSync(logFile) ? readFileSync(logFile, 'utf8').split('\n').slice(-25).join('\n') : ''
      throw new Error(`the Studio in ${dir} didn't come up on port ${port}. Log: ${logFile}\n${tail}`)
    }
    await new Promise((wake) => setTimeout(wake, 500))
  }
  return {stop, url}
}

// --- Comparing ---

function diffStyles(base, candidate) {
  const candidateByPath = new Map(candidate.map((element) => [element.path, element]))
  const basePaths = new Set(base.map((element) => element.path))
  const differences = []
  const removed = []
  for (const element of base) {
    const other = candidateByPath.get(element.path)
    if (!other) {
      removed.push({path: element.path, descriptor: element.descriptor})
      continue
    }
    for (const property of new Set([...Object.keys(element.styles), ...Object.keys(other.styles)])) {
      const was = element.styles[property] ?? '(unset)'
      const is = other.styles[property] ?? '(unset)'
      if (was === is) continue
      if (property.startsWith('box:') && Math.abs(Number(was) - Number(is)) <= BOX_TOLERANCE_PX) continue
      differences.push({path: element.path, descriptor: other.descriptor, property, base: was, candidate: is})
    }
  }
  const added = candidate
    .filter((element) => !basePaths.has(element.path))
    .map((element) => ({path: element.path, descriptor: element.descriptor}))
  return {elements: base.length, differences, added, removed}
}

function padded(image, width, height) {
  if (image.width === width && image.height === height) return image
  const canvas = new PNG({width, height})
  canvas.data.fill(0)
  PNG.bitblt(image, canvas, 0, 0, image.width, image.height, 0, 0)
  return canvas
}

function diffPixels(baseFile, candidateFile) {
  const first = PNG.sync.read(readFileSync(baseFile))
  const second = PNG.sync.read(readFileSync(candidateFile))
  const width = Math.max(first.width, second.width)
  const height = Math.max(first.height, second.height)
  const base = padded(first, width, height).data
  const candidate = padded(second, width, height).data
  const picture = new PNG({width, height})
  const mismatched = pixelmatch(base, candidate, picture.data, width, height, {threshold: 0.1})
  // The worst 32px window anywhere, so one small control can't average out across the window.
  const worstTile = mismatched === 0 ? 0 : pixelmatch(base, candidate, null, width, height, {threshold: 0.1, windowSize: TILE})
  return {
    ratio: mismatched / (width * height),
    tileRatio: worstTile / (TILE * TILE),
    mismatched,
    image: mismatched > 0 ? PNG.sync.write(picture) : null,
  }
}

function compare(name, capturesDir) {
  const file = (side, extension) => join(capturesDir, side, `${name}.${extension}`)
  const missing = ['base', 'candidate'].filter((side) => !existsSync(file(side, 'json')) || !existsSync(file(side, 'png')))
  if (missing.length > 0) {
    return {name, error: `no capture from the ${missing.join(' or the ')}: see the Playwright output above`}
  }
  const read = (side) => JSON.parse(readFileSync(file(side, 'json'), 'utf8'))
  return {
    name,
    error: null,
    styles: diffStyles(read('base'), read('candidate')),
    pixels: diffPixels(file('base', 'png'), file('candidate', 'png')),
  }
}

function styleChanges(result) {
  return result.styles.differences.length + result.styles.added.length + result.styles.removed.length
}

function isClean(result, limits) {
  return (
    result.error === null &&
    styleChanges(result) === 0 &&
    result.pixels.ratio <= limits.pixelLimit &&
    result.pixels.tileRatio <= limits.pixelTileLimit
  )
}

function writeArtifacts(result, capturesDir, runDir) {
  if (result.error !== null) return
  if (styleChanges(result) > 0) {
    mkdirSync(join(runDir, 'styles'), {recursive: true})
    writeFileSync(join(runDir, 'styles', `${result.name}.json`), JSON.stringify(result.styles, null, 2))
  }
  if (result.pixels.image) {
    const dir = join(runDir, 'pixels')
    mkdirSync(dir, {recursive: true})
    for (const side of ['base', 'candidate']) {
      copyFileSync(join(capturesDir, side, `${result.name}.png`), join(dir, `${result.name}-${side}.png`))
    }
    writeFileSync(join(dir, `${result.name}-diff.png`), result.pixels.image)
  }
}

// --- The report ---

const percent = (ratio) => `${(ratio * 100).toFixed(ratio > 0 && ratio < 0.0001 ? 4 : 2)}%`
const cell = (text) => String(text).replace(/\|/g, '\\|').replace(/\n/g, ' ')

function summarise(results, {baseLabel, candidateLabel, limits}) {
  const failing = results.filter((result) => !isClean(result, limits))
  const lines = [
    '# Visual regression: the room',
    '',
    `- Base: ${baseLabel}`,
    `- Candidate: ${candidateLabel}`,
    `- Pixel limits: ${percent(limits.pixelLimit)} of the window, ${percent(limits.pixelTileLimit)} of any ${TILE}px tile`,
    '',
    failing.length === 0
      ? `**PASS**: all ${results.length} captures match.`
      : `**FAIL**: ${failing.length} of ${results.length} captures differ.`,
    '',
    '| Capture | Result | Style differences | Elements added / removed | Pixels | Worst tile | Attempts |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ]
  for (const result of results) {
    if (result.error !== null) {
      lines.push(`| ${result.name} | ERROR | ${cell(result.error)} | | | | ${result.attempts} |`)
      continue
    }
    const {styles, pixels} = result
    lines.push(
      `| ${result.name} | ${isClean(result, limits) ? 'same' : 'DIFF'} | ${styles.differences.length} of ${styles.elements} elements’ worth | ${styles.added.length} / ${styles.removed.length} | ${percent(pixels.ratio)} | ${percent(pixels.tileRatio)} | ${result.attempts} |`,
    )
  }

  const flaky = results.filter((result) => result.attempts > 1 && isClean(result, limits))
  if (flaky.length > 0) {
    lines.push('', `Matched only on a later attempt: ${flaky.map((result) => result.name).join(', ')}.`)
  }

  for (const result of failing) {
    if (result.error !== null) continue
    lines.push('', `## ${result.name}`, '')
    if (result.pixels.image) {
      lines.push(
        `Pixels: [base](pixels/${result.name}-base.png), [candidate](pixels/${result.name}-candidate.png), [diff](pixels/${result.name}-diff.png)`,
        '',
      )
    }
    const {differences, added, removed} = result.styles
    if (differences.length > 0) {
      // The same change usually lands on many elements; the commonest come first.
      const byChange = new Map()
      for (const difference of differences) {
        const key = `${difference.property}\n${difference.base}\n${difference.candidate}`
        byChange.set(key, [...(byChange.get(key) ?? []), difference])
      }
      const changes = [...byChange.values()].sort((a, b) => b.length - a.length)
      lines.push('| Property | Base | Candidate | Elements | For example |', '| --- | --- | --- | --- | --- |')
      for (const group of changes.slice(0, 25)) {
        const [{property, base, candidate, descriptor}] = group
        lines.push(
          `| \`${cell(property)}\` | ${cell(base.slice(0, 80))} | ${cell(candidate.slice(0, 80))} | ${group.length} | ${cell(descriptor)} |`,
        )
      }
      if (changes.length > 25) lines.push('', `…and ${changes.length - 25} more kinds of change.`)
      lines.push('', `Every difference, with its element’s path: [styles/${result.name}.json](styles/${result.name}.json)`)
    }
    for (const [label, paths] of [['Only in the candidate', added], ['Only in the base', removed]]) {
      if (paths.length === 0) continue
      lines.push('', `${label} (${paths.length}):`, '')
      for (const {path, descriptor} of paths.slice(0, 10)) lines.push(`- ${cell(descriptor)} at \`${path}\``)
      if (paths.length > 10) lines.push(`- …and ${paths.length - 10} more`)
    }
  }
  return `${lines.join('\n')}\n`
}

// --- Capturing ---

function playwrightArgs({grep, projects}) {
  const variants = projects.length > 0 ? projects : VARIANTS
  const args = ['exec', 'playwright', 'test', '-c', 'playwright.vrt.config.ts']
  for (const side of ['base', 'candidate']) for (const variant of variants) args.push('--project', `${side}-${variant}`)
  if (grep) args.push('-g', grep)
  return args
}

/** Every capture this run should produce, so a missing one is still reported. */
function expectedNames(options) {
  const list = spawnSync('pnpm', [...playwrightArgs(options), '--list'], {cwd: repo, encoding: 'utf8'})
  const names = new Set()
  // "  [base-desktop-light] › vrt/capture.vrt.ts:67:1 › selection-bubble: formatting above a selection"
  for (const [, variant, state] of (list.stdout ?? '').matchAll(/\[(?:base|candidate)-([a-z-]+)\] › .* › ([a-z-]+): /g)) {
    names.add(`${state}-${variant}`)
  }
  return names
}

function capture({grep, projects, basePort, capturesDir}) {
  const args = playwrightArgs({grep, projects})
  // Its own output goes to stderr with the rest of the progress; stdout is the verdict's.
  spawnSync('pnpm', args, {
    cwd: repo,
    stdio: ['ignore', process.stderr, process.stderr],
    env: {...process.env, VRT_BASE_PORT: String(basePort), VRT_OUT: capturesDir},
  })
}

function captureNames(capturesDir, options) {
  const names = expectedNames(options)
  for (const side of ['base', 'candidate']) {
    const dir = join(capturesDir, side)
    for (const entry of existsSync(dir) ? readdirSync(dir) : []) {
      if (entry.endsWith('.json')) names.add(basename(entry, '.json'))
    }
  }
  return [...names].sort()
}

async function main(options) {
  if (!existsSync(join(repo, '.env.local'))) throw new Error('there is no .env.local: copy .env.example and fill it in')
  if (existsSync(join(repo, '.env.local'))) process.loadEnvFile(join(repo, '.env.local'))
  const candidateUrl = process.env.SANITY_E2E_STUDIO_URL || 'http://localhost:3333'
  const candidatePort = Number(new URL(candidateUrl).port || 80)

  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
  const runDir = resolve(repo, options.out, stamp)
  const logDir = join(runDir, 'logs')
  const capturesDir = join(runDir, 'captures')
  mkdirSync(logDir, {recursive: true})

  const studios = []
  const stopAll = () => studios.forEach((studio) => studio.stop())
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      stopAll()
      process.exit(130)
    })
  }

  try {
    const sha = resolveBaseSha(options)
    const baseDir = await ensureBase(sha, logDir, options.reinstall)
    say(`base ${sha.slice(0, 9)}: starting its Studio on port ${options.basePort}`)
    studios.push(await startStudio(baseDir, options.basePort, join(logDir, 'base-studio.log')))

    let candidateLabel = `the working tree, in the dev Studio already at ${candidateUrl}`
    if (await answers(candidateUrl)) {
      say(`candidate: using the dev Studio already at ${candidateUrl}`)
    } else {
      say(`candidate: starting the working tree's Studio on port ${candidatePort}`)
      studios.push(await startStudio(repo, candidatePort, join(logDir, 'candidate-studio.log')))
      candidateLabel = `the working tree (${git(['rev-parse', '--abbrev-ref', 'HEAD'])}), in a dev Studio at ${candidateUrl}`
    }

    const limits = {pixelLimit: options.pixelLimit, pixelTileLimit: options.pixelTileLimit}
    capture({...options, capturesDir})
    const names = captureNames(capturesDir, options)
    if (names.length === 0) throw new Error('nothing was captured: see the Playwright output above')
    const results = new Map(names.map((name) => [name, {...compare(name, capturesDir), attempts: 1}]))

    for (let attempt = 2; attempt <= options.retries + 1; attempt++) {
      const failing = [...results.values()].filter((result) => !isClean(result, limits))
      if (failing.length === 0) break
      say(`\nCapturing again (attempt ${attempt}), as these differ: ${failing.map((result) => result.name).join(', ')}`)
      // `details-phone-dark` is the state `details` in the window `phone-dark`.
      const split = (name) => {
        const variant = VARIANTS.find((option) => name.endsWith(`-${option}`))
        return {state: name.slice(0, -variant.length - 1), variant}
      }
      // One run per window: states × windows in a single run would also overwrite captures that matched.
      const statesByVariant = new Map()
      for (const result of failing) {
        const {state, variant} = split(result.name)
        statesByVariant.set(variant, [...(statesByVariant.get(variant) ?? []), state])
      }
      for (const result of failing) {
        for (const side of ['base', 'candidate']) {
          for (const extension of ['json', 'png']) rmSync(join(capturesDir, side, `${result.name}.${extension}`), {force: true})
        }
      }
      // A test's title starts with its state: "details: everything that isn't…".
      for (const [variant, states] of statesByVariant) {
        capture({...options, capturesDir, projects: [variant], grep: `(^| )(${states.join('|')}): `})
      }
      for (const result of failing) results.set(result.name, {...compare(result.name, capturesDir), attempts: attempt})
    }

    const ordered = [...results.values()]
    for (const result of ordered) writeArtifacts(result, capturesDir, runDir)
    const subject = git(['log', '-1', '--format=%s', sha])
    writeFileSync(
      join(runDir, 'summary.md'),
      summarise(ordered, {baseLabel: `\`${sha.slice(0, 9)}\` (${subject})`, candidateLabel, limits}),
    )

    say('')
    for (const result of ordered) {
      const clean = isClean(result, limits)
      const detail = result.error ?? `${styleChanges(result)} style, ${percent(result.pixels.ratio)} pixels`
      say(`${clean ? 'same' : result.error ? 'ERROR' : 'DIFF'}  ${result.name}${clean ? '' : `  (${detail})`}`)
    }
    const failing = ordered.filter((result) => !isClean(result, limits))
    console.log(relative(repo, join(runDir, 'summary.md')))
    console.log(failing.length === 0 ? 'PASS' : `FAIL: ${failing.length} of ${ordered.length} captures differ`)
    // A capture that couldn't be compared outranks one that differs.
    if (failing.some((result) => result.error !== null)) process.exitCode = 2
    else if (failing.length > 0) process.exitCode = 1
  } finally {
    stopAll()
  }
}

const argv = process.argv.slice(2)
if (argv.includes('--help') || argv.includes('-h')) {
  console.log(HELP)
} else {
  try {
    await main(parseArgs(argv))
  } catch (error) {
    console.error(`vrt: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 2
  }
}
