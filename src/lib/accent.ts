import {type Palette, palette, type Scheme} from '../tokens'

/**
 * The room's one colour a Studio can change: its accent (links, the caret, focus rings, Publish).
 * Everything that depends on it (the selection highlight, text on the accent) is worked out from
 * it, and the accent itself is nudged until it's readable on the room's paper, so no choice can
 * leave the room hard to read.
 */

type Rgb = [number, number, number]

/** WCAG AA for text. */
const READABLE = 4.5
const SELECTION_ALPHA: Record<Scheme, number> = {light: 0.18, dark: 0.24}

/** `#2F6FA8` or `#26a`, as red, green and blue; null for anything else. */
export function parseHex(value: string): Rgb | null {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim())?.[1]
  if (!hex) return null
  const full = hex.length === 3 ? [...hex].map((digit) => digit + digit).join('') : hex
  return [0, 2, 4].map((at) => parseInt(full.slice(at, at + 2), 16)) as Rgb
}

const toHex = (rgb: Rgb) =>
  `#${rgb.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`.toUpperCase()

function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb
    .map((channel) => channel / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as Rgb
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

const mix = (from: Rgb, to: Rgb, amount: number) =>
  from.map((channel, at) => channel + (to[at]! - channel) * amount) as Rgb

/** The accent as given if it's readable on the scheme's paper; otherwise moved toward the ink until it is. */
function readableOn(accent: Rgb, scheme: Scheme): Rgb {
  const paper = parseHex(palette[scheme].paper)!
  const ink = parseHex(palette[scheme].ink)!
  for (let amount = 0; amount < 1; amount += 0.05) {
    const candidate = mix(accent, ink, amount)
    if (contrast(candidate, paper) >= READABLE) return candidate
  }
  return ink
}

/** The scheme's colours with `accent` in place of the room's own, and what follows from it. */
export function withAccent(scheme: Scheme, accent: string | undefined): Palette {
  const base = palette[scheme]
  if (accent === undefined) return base
  const given = parseHex(accent)
  if (!given) {
    throw new Error(`writingRoom(): \`accent\` must be a hex colour such as "#2F6FA8", not "${accent}".`)
  }
  const readable = readableOn(given, scheme)
  const [onAccent] = [base.paper, base.ink].sort(
    (a, b) => contrast(parseHex(b)!, readable) - contrast(parseHex(a)!, readable),
  ) as [string, string]
  const [r, g, b] = readable.map(Math.round)
  return {
    ...base,
    accent: toHex(readable),
    onAccent,
    selection: `rgba(${r}, ${g}, ${b}, ${SELECTION_ALPHA[scheme]})`,
  }
}

/** One colour for both schemes, or one each. */
export type Accent = string | Partial<Record<Scheme, string>>

/** The room's colours per scheme, with the Studio's accent if it set one. */
export function resolvePalette(accent?: Accent): Record<Scheme, Palette> {
  const per = typeof accent === 'string' ? {light: accent, dark: accent} : (accent ?? {})
  return {light: withAccent('light', per.light), dark: withAccent('dark', per.dark)}
}
