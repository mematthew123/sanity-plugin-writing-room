import {createContext, createElement, type ReactNode, useContext} from 'react'

/** How the room's Preview opens a Post on your site, in draft mode. */
export interface WritingRoomPreviewOptions {
  /** Your site's origin, e.g. `https://example.com` or `http://localhost:3000`. */
  origin: string
  /**
   * The route on your site that checks the preview secret and turns on draft mode.
   * Defaults to `/api/draft-mode/enable` (the `next-sanity` convention).
   */
  enablePath?: string
  /** Where a Post is read on your site. Defaults to `/posts/<slug>`. */
  pathname?: (slug: string) => string
}

/** Options for `writingRoom()`. Every one is optional. */
export interface WritingRoomOptions {
  /**
   * Turns on the room's Preview button, which opens the Post on your site exactly as readers
   * will see it, unpublished changes included. Leave it out and Preview is hidden.
   */
  preview?: WritingRoomPreviewOptions
}

/** The options with every default filled in, as the room reads them. */
export interface WritingRoomConfig {
  preview: Required<WritingRoomPreviewOptions> | null
}

export function resolveConfig(options: WritingRoomOptions = {}): WritingRoomConfig {
  const {preview} = options
  return {
    preview: preview
      ? {
          origin: preview.origin,
          enablePath: preview.enablePath ?? '/api/draft-mode/enable',
          pathname: preview.pathname ?? ((slug) => `/posts/${slug}`),
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
