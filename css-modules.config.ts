import {Features, type CSSModulesConfig} from 'lightningcss'

/**
 * How lightningcss compiles the room's `.module.css` files, in the built package (tsdown.config.ts)
 * and in `sanity dev` (sanity.cli.ts) alike, so what is tested is what is published.
 */
export const cssModules: CSSModulesConfig = {
  // Classes and keyframes are renamed; grid areas and containers keep their names.
  // `customIdents` stays on: it is what renames an `animation` to match its `@keyframes`.
  pattern: 'calm-[hash]-[local]',
  grid: false,
  container: false,
}

/** Nesting is flattened, as styled-components did, so the room asks no more of a browser than before. */
export const include = Features.Nesting
