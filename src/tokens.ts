/*
 * The Writing Room's design tokens. A copy of Calm Editor's @calm/tokens, whose Reading Site uses
 * the same values: change them in both places.
 */
/**
 * Shared design tokens for the Writing Room, the Studio theme, and the Reading Site.
 *
 * This file is the single source of truth. `tokens.css` is generated from it
 * (`pnpm --filter @calm/tokens build`) and must never be edited by hand.
 */

export type Scheme = 'light' | 'dark'

export interface Palette {
  /** The page itself: warm, never pure white or black. */
  paper: string
  /** A gently raised surface: Code Blocks, Embed cards, the Selection Bubble. */
  surface: string
  /** Hairlines and borders. Decorative only. */
  rule: string
  /** Prose. */
  ink: string
  /** Room Controls, captions, placeholders. Meets AA on paper. */
  inkMuted: string
  /** Ornaments (the Section Break) and disabled states. Decorative only. */
  inkFaint: string
  /** The one accent: caret, selection, links, Publish. */
  accent: string
  /** Text drawn on top of `accent`. */
  onAccent: string
  /** Text selection highlight. */
  selection: string
  /** Messages that must not recede: offline, blocked publish. */
  caution: string
  /** Lift for floating things (Selection Bubble, Insert Menu). Dark relies on `rule` borders instead. */
  floatingShadow: string
}

export const palette: Record<Scheme, Palette> = {
  light: {
    paper: '#FAF7F2',
    surface: '#F2ECE3',
    rule: '#E7DFD4',
    ink: '#2E2823',
    inkMuted: '#6E645B',
    inkFaint: '#A3988C',
    accent: '#A8532F',
    onAccent: '#FAF7F2',
    selection: 'rgba(168, 83, 47, 0.18)',
    caution: '#8A5300',
    floatingShadow: '0 1px 2px rgba(46, 40, 35, 0.06), 0 8px 24px rgba(46, 40, 35, 0.08)',
  },
  dark: {
    paper: '#1E1B18',
    surface: '#28241F',
    rule: '#35302A',
    ink: '#EDE6DB',
    inkMuted: '#ADA295',
    inkFaint: '#6F665C',
    accent: '#E39A78',
    onAccent: '#1E1B18',
    selection: 'rgba(227, 154, 120, 0.24)',
    caution: '#E5B567',
    floatingShadow: 'none',
  },
}

export const fonts = {
  /** Prose: titles, body, captions on the Reading Site. */
  prose: '"Newsreader Variable", "Newsreader", Georgia, "Times New Roman", serif',
  /** Room Controls and the Studio UI. */
  ui: '"Figtree Variable", "Figtree", ui-sans-serif, system-ui, sans-serif',
  /** Code Blocks. */
  mono: 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace',
} as const

/** Prose body size per Room Settings text size; everything else in `type` scales from it. */
export const proseSize = {
  small: '1.125rem',
  medium: '1.25rem',
  large: '1.375rem',
} as const

/** Relative to the prose body size (em). */
export const type = {
  title: '2.25em',
  heading: '1.5em',
  subheading: '1.2em',
  caption: '0.85em',
  code: '0.85em',
  /** Space between paragraphs and around blocks in the body. */
  proseGap: '1em',
  proseLeading: '1.65',
  headingLeading: '1.25',
  uiSize: '0.875rem',
  uiSizeSmall: '0.8125rem',
} as const

export const weight = {
  prose: '400',
  title: '500',
  heading: '600',
  ui: '450',
  uiStrong: '600',
} as const

/** A 4px-based scale for Room Controls and the Lobby. Prose spacing is em-based (see `type`). */
export const space = {
  xs: '0.25rem',
  sm: '0.5rem',
  md: '1rem',
  lg: '1.5rem',
  xl: '2.5rem',
  xxl: '4rem',
} as const

export const layout = {
  /** The reading/writing column. ~68 characters of Newsreader at body size. */
  measure: '38rem',
  radius: '0.5rem',
  radiusLarge: '0.875rem',
  radiusPill: '999px',
} as const

export const motion = {
  /** A button giving under a press. Quicker than `gentle`, so the click feels received at once. */
  press: '150ms',
  /** Small responses: hover, the Selection Bubble appearing. */
  gentle: '200ms',
  /** Room Controls returning or receding. Slow enough to feel unhurried. */
  recede: '700ms',
  easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
} as const

const kebab = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)

function declarations(prefix: string, values: Record<string, string>, indent: string): string {
  return Object.entries(values)
    .map(([key, value]) => `${indent}--calm-${prefix}${kebab(key)}: ${value};`)
    .join('\n')
}

/**
 * Renders the tokens as CSS custom properties (`--calm-*`).
 *
 * Light is the default. Dark applies when an ancestor carries `data-scheme="dark"`,
 * or when the OS prefers dark and nothing has forced `data-scheme="light"`.
 */
export function toCss(): string {
  const constants = [
    declarations('font-', fonts, '  '),
    declarations('prose-size-', proseSize, '  '),
    declarations('type-', type, '  '),
    declarations('weight-', weight, '  '),
    declarations('space-', space, '  '),
    declarations('', layout, '  '),
    declarations('motion-', motion, '  '),
  ].join('\n')

  return `/* Generated from @calm/tokens/src/index.ts. Do not edit by hand. */

:root,
[data-scheme='light'] {
  color-scheme: light;
${declarations('color-', {...palette.light}, '  ')}
}

:root {
${constants}
}

[data-scheme='dark'] {
  color-scheme: dark;
${declarations('color-', {...palette.dark}, '  ')}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-scheme='light']) {
    color-scheme: dark;
${declarations('color-', {...palette.dark}, '    ')}
  }
}
`
}

/**
 * The same tokens, set only on the given elements (a plugin's own surface and popovers), never on
 * `:root` or on other elements' `data-scheme`, so they can't change the rest of a Studio: its
 * `color-scheme`, its scrollbars, or Sanity UI cards that carry their own `data-scheme`.
 */
export function toScopedCss(
  selectors: string[],
  colors: Record<Scheme, Palette> = palette,
): string {
  const on = (suffix = '') => selectors.map((selector) => `${selector}${suffix}`).join(',\n')
  const constants = [
    declarations('font-', fonts, '  '),
    declarations('prose-size-', proseSize, '  '),
    declarations('type-', type, '  '),
    declarations('weight-', weight, '  '),
    declarations('space-', space, '  '),
    declarations('', layout, '  '),
    declarations('motion-', motion, '  '),
  ].join('\n')

  return `${on()} {
  color-scheme: light;
${declarations('color-', {...colors.light}, '  ')}
${constants}
}

${on("[data-scheme='dark']")} {
  color-scheme: dark;
${declarations('color-', {...colors.dark}, '  ')}
}

@media (prefers-color-scheme: dark) {
  ${on(":not([data-scheme='light'])").replace(/\n/g, '\n  ')} {
    color-scheme: dark;
${declarations('color-', {...colors.dark}, '    ')}
  }
}
`
}
