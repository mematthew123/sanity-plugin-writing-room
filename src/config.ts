import {resolvePalette} from './lib/accent'
import {type Palette} from './tokens'
import {createContext, createElement, type ReactNode, useContext} from 'react'
import {type WritingFields} from './room/fields'

export interface WritingRoomTypeOptions {
  type: string
  /** What one is called in the room ("New Case Study"). Defaults to the schema type's title. */
  title?: string
  /** What several are called ("Case Studies"). Defaults to `title` made plural. */
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

/**
 * The room's accent: one hex colour for both schemes (`'#2F6FA8'`), or one each
 * (`{light: '#2F6FA8', dark: '#8DB8E0'}`).
 */
export type WritingRoomAccent = string | Partial<Record<WritingRoomScheme, string>>

export interface WritingRoomOptions {
  /**
   * Each type needs at least a title and a portable text body. The first opens at
   * `/writing-room/<id>`, the rest at `/writing-room/<type>/<id>`. Defaults to `['post']`.
   */
  types?: Array<string | WritingRoomTypeOptions>
  /** Shows a Preview button that opens the draft on your site. Hidden when omitted. */
  preview?: WritingRoomPreviewOptions
  /**
   * The room's accent (links, the caret, focus rings, Publish). The room keeps it readable on its
   * paper in both schemes and derives the selection and on-Publish text from it. Inside the room only.
   */
  accent?: WritingRoomAccent
}

export interface WritingRoomConfig {
  /** Never empty. */
  types: WritingRoomTypeOptions[]
  /** The room's whole palette per scheme, with the Studio's accent worked in. */
  colors: Record<WritingRoomScheme, Palette>
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
    colors: resolvePalette(options.accent),
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
