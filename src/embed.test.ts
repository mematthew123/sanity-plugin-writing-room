import {describe, expect, it} from 'vitest'
import {embedPlayerUrl, parseEmbedUrl} from './embed'

describe('parseEmbedUrl', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ])('recognises YouTube: %s', (url, id) => {
    expect(parseEmbedUrl(url)).toEqual({provider: 'youtube', id})
  })

  it.each([
    ['https://vimeo.com/76979871', '76979871'],
    ['https://vimeo.com/channels/staffpicks/76979871', '76979871'],
    ['https://player.vimeo.com/video/76979871', '76979871'],
  ])('recognises Vimeo: %s', (url, id) => {
    expect(parseEmbedUrl(url)).toEqual({provider: 'vimeo', id})
  })

  it.each([
    ['https://vimeo.com/76979871/abcdef1234', 'abcdef1234'],
    ['https://player.vimeo.com/video/76979871?h=abcdef1234', 'abcdef1234'],
  ])('keeps the privacy hash of an unlisted Vimeo video: %s', (url, hash) => {
    expect(parseEmbedUrl(url)).toEqual({provider: 'vimeo', id: '76979871', hash})
  })

  it('round-trips an unlisted Vimeo share link to a player url that keeps its hash', () => {
    const embed = parseEmbedUrl('https://vimeo.com/76979871/abcdef1234')
    expect(embed && embedPlayerUrl(embed)).toBe(
      'https://player.vimeo.com/video/76979871?h=abcdef1234&dnt=1',
    )
  })

  it.each([
    ['https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC', 'track', '4uLU6hMCjMI75M1A2tKUQC'],
    ['https://open.spotify.com/intl-de/album/1DFixLWuPkv3KT3TnV35m3?si=x', 'album', '1DFixLWuPkv3KT3TnV35m3'],
    ['https://open.spotify.com/episode/7makk4oTQel546B0PZlDM5', 'episode', '7makk4oTQel546B0PZlDM5'],
    ['https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M', 'playlist', '37i9dQZF1DXcBWIGoYBM5M'],
  ])('recognises Spotify: %s', (url, kind, id) => {
    expect(parseEmbedUrl(url)).toEqual({provider: 'spotify', id: `${kind}/${id}`})
  })

  it.each([
    'https://example.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/@somechannel',
    'https://vimeo.com/about',
    'https://open.spotify.com/user/someone',
    'not a url',
    '',
  ])('rejects unsupported links: %s', (url) => {
    expect(parseEmbedUrl(url)).toBeNull()
  })
})

describe('embedPlayerUrl', () => {
  it.each([
    [{provider: 'youtube', id: 'dQw4w9WgXcQ'}, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'],
    [{provider: 'vimeo', id: '76979871'}, 'https://player.vimeo.com/video/76979871?dnt=1'],
    [{provider: 'spotify', id: 'track/4uLU6hMCjMI75M1A2tKUQC'}, 'https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC'],
  ] as const)('%o → %s', (embed, url) => {
    expect(embedPlayerUrl(embed)).toBe(url)
  })
})
