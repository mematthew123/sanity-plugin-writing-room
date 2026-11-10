import {type Palette, palette} from '@calm/tokens'
import {createContext, createElement, type ReactNode, useContext} from 'react'
import {type WritingFields} from './room/fields'

/** A document type the room writes, with what the room calls it. */
export interface WritingRoomTypeOptions {
  /** The document type's name in your schema, e.g. `'post'`. */
  type: string
  /** What one is called in the room ("Start a new Case Study"). Defaults to the schema type's title. */
  title?: string
  /** What several are called ("All Case Studies"). Defaults to `title` made plural. */
  pluralTitle?: string
  /**
   * Which fields the room uses, when it can't tell from the schema. Usually unnecessary: it finds
   * `title`, the portable text body, `slug`, `publishedAt` and the cover image by itself.
   */
  fields?: Partial<WritingFields>
}

/** How the room's Preview opens a document on your site, in draft mode. */
export interface WritingRoomPreviewOptions {
  /** Your site's origin, e.g. `https://example.com` or `http://localhost:3000`. */
  origin: string
  /**
   * The route on your site that checks the preview secret and turns on draft mode.
   * Defaults to `/api/draft-mode/enable` (the `next-sanity` convention).
   */
  enablePath?: string
  /**
   * Where a document is read on your site. Defaults to `/posts/<slug>` for `post` and
   * `/<type>/<slug>` for any other type.
   */
  pathname?: (slug: string, documentType: string) => string
}

export type WritingRoomScheme = 'light' | 'dark'

/**
 * The room's colours for one scheme. Change only what you need, e.g. `{accent: '#2F6FA8'}`; keep
 * text readable against `paper` and `surface` (the defaults meet WCAG AA).
 */
export interface WritingRoomColors {
  /** The page. */
  paper?: string
  /** Raised things on the page: the Lobby's Start buttons, hovered rows. */
  surface?: string
  /** Hairlines and outlines. */
  rule?: string
  /** Text. */
  ink?: string
  /** Secondary text: status, hints. */
  inkMuted?: string
  /** Ornaments and placeholders. */
  inkFaint?: string
  /** Links, focus rings, the Publish button. */
  accent?: string
  /** Text on the accent. */
  onAccent?: string
  /** Selected text. */
  selection?: string
  /** Problems the Writer needs to fix. */
  caution?: string
  /** Popovers' shadow (a CSS box-shadow). */
  floatingShadow?: string
}

/** Fails to compile if the palette gains or loses a colour that `WritingRoomColors` doesn't. */
type SameKeys<A, B> = [keyof A] extends [keyof B] ? ([keyof B] extends [keyof A] ? true : never) : never
const colorsMatchPalette: SameKeys<Required<WritingRoomColors>, Palette> = true
void colorsMatchPalette

/** Options for `writingRoom()`. Every one is optional. */
export interface WritingRoomOptions {
  /**
   * The document types the room writes, e.g. `['post', 'caseStudy']`. The room finds each type's
   * title, portable text body, slug, published date and cover image in its schema; a type needs
   * at least a title and a body.
   *
   * The first is the default: its documents open at `/writing-room/<id>`, the others at
   * `/writing-room/<type>/<id>`. Defaults to `['post']`.
   */
  types?: Array<string | WritingRoomTypeOptions>
  /**
   * Turns on the room's Preview button, which opens the document on your site exactly as readers
   * will see it, unpublished changes included. Leave it out and Preview is hidden.
   */
  preview?: WritingRoomPreviewOptions
  /**
   * The room's colours, over the defaults, per scheme: `{light: {accent: '#2F6FA8'}, dark: {…}}`.
   * They apply inside the room only, never to the rest of the Studio.
   */
  colors?: Partial<Record<WritingRoomScheme, WritingRoomColors>>
}

/** The options with every default filled in, as the room reads them. */
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

/** The plugin's resolved options, anywhere inside the Writing Room Tool. */
export function useWritingRoomConfig(): WritingRoomConfig {
  return useContext(WritingRoomConfigContext)
}
