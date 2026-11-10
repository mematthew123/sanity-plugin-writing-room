export type EmbedProvider = 'youtube' | 'vimeo' | 'spotify'

export interface ParsedEmbed {
  provider: EmbedProvider
  /** For Spotify, includes the kind, e.g. `track/4uLU6…`. */
  id: string
  /** Vimeo only: needed to play unlisted videos. */
  hash?: string
}

export const EMBED_PROVIDER_NAMES: Record<EmbedProvider, string> = {
  youtube: 'YouTube',
  vimeo: 'Vimeo',
  spotify: 'Spotify',
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/
const VIMEO_HASH = /^[A-Za-z0-9]+$/
const SPOTIFY_KINDS = new Set(['track', 'album', 'playlist', 'episode', 'show', 'artist'])

export function parseEmbedUrl(input: string): ParsedEmbed | null {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return null
  }
  const host = url.hostname.replace(/^(www|m)\./, '')
  const segments = url.pathname.split('/').filter(Boolean)

  if (host === 'youtube.com') {
    const id =
      segments[0] === 'watch'
        ? url.searchParams.get('v')
        : ['embed', 'shorts', 'live'].includes(segments[0] ?? '')
          ? segments[1]
          : null
    return id && YOUTUBE_ID.test(id) ? {provider: 'youtube', id} : null
  }
  if (host === 'youtu.be') {
    const id = segments[0]
    return id && YOUTUBE_ID.test(id) ? {provider: 'youtube', id} : null
  }

  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const index = segments.findIndex((segment) => /^\d+$/.test(segment))
    if (index === -1) return null
    const id = segments[index]
    // Unlisted videos carry a hash: `vimeo.com/ID/HASH` when shared, `?h=HASH` on player links.
    const hash = url.searchParams.get('h') ?? segments[index + 1]
    return hash && VIMEO_HASH.test(hash) ? {provider: 'vimeo', id, hash} : {provider: 'vimeo', id}
  }

  if (host === 'open.spotify.com') {
    const rest = segments[0]?.startsWith('intl-') ? segments.slice(1) : segments
    const [kind, id] = rest
    return kind && id && SPOTIFY_KINDS.has(kind) ? {provider: 'spotify', id: `${kind}/${id}`} : null
  }

  return null
}

export function embedPlayerUrl({provider, id, hash}: ParsedEmbed): string {
  switch (provider) {
    case 'youtube':
      return `https://www.youtube-nocookie.com/embed/${id}`
    case 'vimeo':
      return hash
        ? `https://player.vimeo.com/video/${id}?h=${hash}&dnt=1`
        : `https://player.vimeo.com/video/${id}?dnt=1`
    case 'spotify':
      return `https://open.spotify.com/embed/${id}`
  }
}
