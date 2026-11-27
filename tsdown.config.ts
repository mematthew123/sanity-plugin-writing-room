import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {relative, resolve} from 'node:path'
import {transform} from 'lightningcss'
import {defineConfig, type UserConfig} from 'tsdown'
import {cssModules, include} from './css-modules.config.ts'

type Plugin = Extract<NonNullable<UserConfig['plugins']>, {name: string}>

const ADD_STYLES = resolve(import.meta.dirname, 'src/lib/add-styles.ts')

/** Compiles each `.module.css` into its class names and a call that injects its rules. */
function cssModulesInJs(): Plugin {
  return {
    name: 'css-modules-in-js',
    async load(id) {
      if (!id.endsWith('.module.css')) return null
      const file = relative(import.meta.dirname, id)
      const {code, exports = {}} = transform({
        filename: file,
        code: await readFile(id),
        cssModules,
        include,
        minify: true,
      })
      for (const [local, {composes}] of Object.entries(exports)) {
        if (composes.some((composed) => composed.type === 'dependency')) {
          this.error(`${file}: .${local} composes from another file, which this build doesn't carry.`)
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
      const css = code.toString()
      const key = createHash('sha256').update(css).digest('hex').slice(0, 8)
      return {
        code: [
          `import {addStyles} from ${JSON.stringify(ADD_STYLES)}`,
          `addStyles(${JSON.stringify(key)}, ${JSON.stringify(css)})`,
          `export default ${JSON.stringify(classes)}`,
        ].join('\n'),
        moduleType: 'js',
        // Keeps the `addStyles` call from being dropped as unused.
        moduleSideEffects: true,
      }
    },
  }
}

export default defineConfig([
  {
    entry: ['src/index.ts', 'src/theme.ts'],
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    dts: true,
    sourcemap: true,
    clean: true,
    // Inlined so Studios need no font packages or font loader.
    loader: {'.woff2': 'dataurl'},
    // The plugin below handles CSS; tsdown's own would emit a stylesheet.
    css: false,
    plugins: [cssModulesInJs()],
  },
  {
    // Server-only. `ai` stays an import: an optional peer.
    entry: {sorting: 'src/sorting/index.ts'},
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    dts: true,
    sourcemap: true,
    clean: false,
  },
])
