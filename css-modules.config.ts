import {createHash} from 'node:crypto'
import {existsSync, readdirSync, readFileSync} from 'node:fs'
import {join, relative, sep} from 'node:path'
import {Features, transform} from 'lightningcss'
import {type UserConfig} from 'tsdown'

type Plugin = Extract<NonNullable<UserConfig['plugins']>, {name: string}>

const ROOT = import.meta.dirname
/** What the room imports for its whole stylesheet (see WritingRoomTool.tsx). */
const SHEET = 'virtual:room-styles'
const SHEET_ID = `\0${SHEET}`
const CLASSES_ID = '\0room-classes:'

/**
 * Modules whose components take a `className` and add it to their own. Their rules come first in
 * the stylesheet, in this order, so the rule of the component that builds on them always wins.
 */
const SHARED_FIRST = [
  'src/room/primitives.module.css',
  'src/room/editor/isolate.module.css',
  'src/room/editor/floating.module.css',
  'src/room/editor/blocks/frame.module.css',
]

/** Every module, as a path from the repository root: the shared ones, then the rest by name. */
function modules(): string[] {
  const missing = SHARED_FIRST.filter((file) => !existsSync(join(ROOT, file)))
  if (missing.length) throw new Error(`css-modules.config.ts lists modules that aren't there: ${missing.join(', ')}`)
  const all = readdirSync(join(ROOT, 'src'), {recursive: true, encoding: 'utf8'})
    .filter((file) => file.endsWith('.module.css'))
    .map((file) => `src/${file.split(sep).join('/')}`)
  return [...SHARED_FIRST, ...all.filter((file) => !SHARED_FIRST.includes(file)).sort()]
}

function compile(path: string): {classes: Record<string, string>; css: string} {
  const filename = relative(ROOT, path).split(sep).join('/')
  const {code, exports = {}} = transform({
    filename,
    code: readFileSync(path),
    cssModules: {
      // Content-hashed, so two versions of the plugin on one page can't collide.
      // Leave `customIdents` on: it renames each `animation` to match its `@keyframes`.
      pattern: 'calm-[content-hash]-[local]',
      grid: false,
      container: false,
    },
    // For browsers without them: nesting is flattened, and a breakpoint stays `max-width`
    // (minifying would otherwise write it as `width<=`).
    include: Features.Nesting | Features.MediaRangeSyntax,
    minify: true,
  })
  for (const [local, {composes}] of Object.entries(exports)) {
    if (composes.some((composed) => composed.type === 'dependency')) {
      throw new Error(`${filename}: .${local} composes from another file, which this build doesn't carry.`)
    }
  }
  const byName = new Map(Object.values(exports).map((entry) => [entry.name, entry]))
  // Lightning CSS names only the direct target, so follow each target's own `composes`.
  const chain = (name: string, seen = new Set<string>()): string[] => {
    if (seen.has(name)) return []
    seen.add(name)
    return [name, ...(byName.get(name)?.composes ?? []).flatMap((composed) => chain(composed.name, seen))]
  }
  const classes = Object.fromEntries(
    Object.entries(exports).map(([local, {name}]) => [local, chain(name).join(' ')]),
  )
  return {classes, css: code.toString()}
}

/**
 * Compiles the room's CSS Modules, for the build (tsdown.config.ts) and for `sanity dev`
 * (sanity.cli.ts) alike. A `.module.css` import becomes its class names and nothing else;
 * `virtual:room-styles` is every module's rules as one string, which the room renders itself.
 */
export function roomStyles(): Plugin {
  return {
    name: 'room-styles',
    async resolveId(source, importer) {
      if (source === SHEET) return SHEET_ID
      if (!source.endsWith('.module.css') || !importer) return null
      const resolved = await this.resolve(source, importer, {skipSelf: true})
      // Not left ending in `.css`, which a bundler would compile again as a stylesheet.
      return resolved && `${CLASSES_ID}${resolved.id}.js`
    },
    load(id) {
      if (id === SHEET_ID) {
        const css = modules()
          .map((file) => {
            this.addWatchFile(join(ROOT, file))
            return compile(join(ROOT, file)).css
          })
          .join('')
        // Part of the `<style>`'s `href`, which is what React tells two stylesheets apart by.
        const key = createHash('sha256').update(css).digest('hex').slice(0, 8)
        return {
          code: `export const css = ${JSON.stringify(css)}\nexport const key = ${JSON.stringify(key)}`,
          moduleType: 'js',
          moduleSideEffects: false,
        }
      }
      if (id.startsWith(CLASSES_ID)) {
        const path = id.slice(CLASSES_ID.length, -'.js'.length)
        this.addWatchFile(path)
        return {
          code: `export default ${JSON.stringify(compile(path).classes)}`,
          moduleType: 'js',
          moduleSideEffects: false,
        }
      }
      return null
    },
  }
}

/** The same, for Vite: ahead of its own CSS handling, and with an edit to a module reaching the page. */
export function roomStylesInDev() {
  return {
    ...roomStyles(),
    enforce: 'pre' as const,
    handleHotUpdate({file, server}: {file: string; server: {moduleGraph: {getModuleById(id: string): unknown}}}) {
      if (!file.endsWith('.module.css')) return undefined
      const {moduleGraph} = server
      return [moduleGraph.getModuleById(`${CLASSES_ID}${file}.js`), moduleGraph.getModuleById(SHEET_ID)].filter(Boolean)
    },
  }
}
