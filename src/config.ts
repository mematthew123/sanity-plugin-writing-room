import {type Palette, palette} from './tokens'
import {createContext, createElement, type ReactNode, useContext} from 'react'
import {type WritingFields} from './room/fields'

export interface WritingRoomTypeOptions {
  type: string
  /** Defaults to the schema type's title. */
  title?: string
  /** Defaults to `title` made plural. */
  pluralTitle?: string
  /** Only needed when the room can't detect a field from the schema. */
  fields?: Partial<WritingFields>
}

export interface WritingRoomPreviewOptions {
  /** e.g. `https://example.com` */
  origin: string
  /** The route that turns on draft mode. Defaults to `/api/draft-mode/enable`. */
  enablePath?: string
  /** Defaults to `/posts/<slug>` for `post`, `/<type>/<slug>` otherwise. */
  pathname?: (slug: string, documentType: string) => string
}

export type WritingRoomScheme = 'light' | 'dark'

/** Keep text readable against `paper` and `surface`; the defaults meet WCAG AA. */
export interface WritingRoomColors {
  /** Page background. */
  paper?: string
  /** Raised elements: buttons, hovered rows. */
  surface?: string
  /** Hairlines and borders. */
  rule?: string
  /** Body text. */
  ink?: string
  /** Secondary text. */
  inkMuted?: string
  /** Ornaments and placeholders. */
  inkFaint?: string
  /** Links, focus rings, Publish. */
  accent?: string
  onAccent?: string
  selection?: string
  /** Problems the Writer needs to fix. */
  caution?: string
  /** A CSS box-shadow for popovers. */
  floatingShadow?: string
}

/** Keeps `WritingRoomColors` in step with the palette. */
type SameKeys<A, B> = [keyof A] extends [keyof B] ? ([keyof B] extends [keyof A] ? true : never) : never
const colorsMatchPalette: SameKeys<Required<WritingRoomColors>, Palette> = true
void colorsMatchPalette

export interface WritingRoomOptions {
  /**
   * Each type needs at least a title and a portable text body. The first opens at
   * `/writing-room/<id>`, the rest at `/writing-room/<type>/<id>`. Defaults to `['post']`.
   */
  types?: Array<string | WritingRoomTypeOptions>
  /** Shows a Preview button that opens the draft on your site. Hidden when omitted. */
  preview?: WritingRoomPreviewOptions
  /** Overrides per scheme, e.g. `{light: {accent: '#2F6FA8'}}`. Applies inside the room only. */
  colors?: Partial<Record<WritingRoomScheme, WritingRoomColors>>
}

export interface WritingRoomConfig {
  /** Never empty. */
  types: WritingRoomTypeOptions[]
  colors: Record<WritingRoomScheme, Required<WritingRoomColors>>
  preview: Required<WritingRoomPreviewOptions> | null
}

function defaultPathname(slug: string, documentType: string) {
  return documentType === 'post' ? `/posts/${slug}` : `/${documentType}/${slug}`
}

function resolveTypes(types: WritingRoomOptions['types'] = ['post']): WritingRoomTypeOptions[] {
  const resolved = types.map((option) => (typeof option === 'string' ? {type: option} : option))
  if (resolved.length === 0) {
    throw new Error('writingRoom(): `types` needs at least one document type.')
  }
  const seen = new Set<string>()
  for (const {type} of resolved) {
    if (seen.has(type)) throw new Error(`writingRoom(): "${type}" is listed twice in \`types\`.`)
    seen.add(type)
  }
  return resolved
}

export function resolveConfig(options: WritingRoomOptions = {}): WritingRoomConfig {
  const {preview} = options
  return {
    types: resolveTypes(options.types),
    colors: {
      light: {...palette.light, ...options.colors?.light},
      dark: {...palette.dark, ...options.colors?.dark},
    },
    preview: preview
      ? {
          origin: preview.origin,
          enablePath: preview.enablePath ?? '/api/draft-mode/enable',
          pathname: preview.pathname ?? defaultPathname,
        }
      : null,
  }
}

const WritingRoomConfigContext = createContext<WritingRoomConfig>(resolveConfig())

export function WritingRoomConfigProvider({
  config,
  children,
}: {
  config: WritingRoomConfig
  children: ReactNode
}) {
  return createElement(WritingRoomConfigContext.Provider, {value: config}, children)
}

export function useWritingRoomConfig(): WritingRoomConfig {
  return useContext(WritingRoomConfigContext)
}
