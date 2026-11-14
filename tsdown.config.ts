import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {relative, resolve} from 'node:path'
import {Features, transform} from 'lightningcss'
import {defineConfig, type UserConfig} from 'tsdown'

type Plugin = Extract<NonNullable<UserConfig['plugins']>, {name: string}>

const ADD_STYLES = resolve(import.meta.dirname, 'src/lib/add-styles.ts')

/**
 * Compiles each `.module.css` into its class names and a call that puts its rules on the page, so
 * the room's CSS travels inside its JavaScript and a Studio has no stylesheet to import.
 */
function cssModulesInJs(): Plugin {
  return {
    name: 'css-modules-in-js',
    async load(id) {
      if (!id.endsWith('.module.css')) return null
      const file = relative(import.meta.dirname, id)
      const {code, exports = {}} = transform({
        filename: file,
        code: await readFile(id),
        // Only classes and keyframes are renamed, as in `sanity dev`: counters and grid areas keep their names.
        cssModules: {pattern: 'calm-[hash]-[local]', grid: false, customIdents: false, container: false},
        // Flattened, as styled-components did, so the room asks no more of a browser than before.
        include: Features.Nesting,
        minify: true,
      })
      const classes = Object.fromEntries(
        Object.entries(exports).map(([local, {name, composes}]) => [
          local,
          [name, ...composes.map((composed) => composed.name)].join(' '),
        ]),
      )
      const key = createHash('sha256').update(file).digest('hex').slice(0, 8)
      return {
        code: [
          `import {addStyles} from ${JSON.stringify(ADD_STYLES)}`,
          `addStyles(${JSON.stringify(key)}, ${JSON.stringify(code.toString())})`,
          `export default ${JSON.stringify(classes)}`,
        ].join('\n'),
        moduleType: 'js',
        // The call above is the point of the module; never drop it as unused.
        moduleSideEffects: true,
      }
    },
  }
}

export default defineConfig({
  entry: ['src/index.ts', 'src/theme.ts'],
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  dts: true,
  sourcemap: true,
  clean: true,
  // Inlined so Studios need no font packages or font loader.
  loader: {'.woff2': 'dataurl'},
  // Ours, below: tsdown's own would emit a stylesheet for the Studio to import.
  css: false,
  plugins: [cssModulesInJs()],
})
