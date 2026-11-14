import {Features, type CSSModulesConfig} from 'lightningcss'

/** Shared by the build (tsdown.config.ts) and `sanity dev` (sanity.cli.ts). */
export const cssModules: CSSModulesConfig = {
  // Content-hashed, so two versions of the plugin on one page never share a name for different rules.
  // Leave `customIdents` on: it renames each `animation` to match its `@keyframes`.
  pattern: 'calm-[content-hash]-[local]',
  grid: false,
  container: false,
}

/** Flattens nesting, for browsers without it. */
export const include = Features.Nesting
