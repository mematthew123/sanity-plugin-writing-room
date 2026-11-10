import {createContext, createElement, type ReactNode, useContext} from 'react'

/** A document type the room writes, with what the room calls it. */
export interface WritingRoomTypeOptions {
  /** The document type's name in your schema, e.g. `'post'`. */
  type: string
  /** What one is called in the room ("Start a new Case Study"). Defaults to the schema type's title. */
  title?: string
  /** What several are called ("All Case Studies"). Defaults to `title` made plural. */
  pluralTitle?: string
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

/** Options for `writingRoom()`. Every one is optional. */
export interface WritingRoomOptions {
  /**
   * The document types the room writes, e.g. `['post', 'caseStudy']`. Each needs the fields the
   * room reads and writes: `title`, `body` (the `body` type), `slug` and `publishedAt`.
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
}

/** The options with every default filled in, as the room reads them. */
export interface WritingRoomConfig {
  /** Never empty. */
  types: WritingRoomTypeOptions[]
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
