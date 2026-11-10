/// <reference path="../assets.d.ts" />
import figtreeLatin from '@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2'
import figtreeLatinExt from '@fontsource-variable/figtree/files/figtree-latin-ext-wght-normal.woff2'

/** Unicode ranges from Fontsource, so a browser only uses each file for the characters it covers. */
export const LATIN =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
export const LATIN_EXT =
  'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF'

export function face(family: string, style: 'normal' | 'italic', weight: string, url: string, range: string) {
  return `@font-face {
  font-family: '${family}';
  font-style: ${style};
  font-display: swap;
  font-weight: ${weight};
  src: url(${url}) format('woff2-variations');
  unicode-range: ${range};
}`
}

/**
 * Figtree, the room's UI face (and the Studio's, with `writingRoomTheme`): Latin and Latin
 * Extended. Its own module, so the theme can load it without the room's prose fonts.
 */
export const UI_FONT_FACES_CSS = [
  face('Figtree Variable', 'normal', '300 900', figtreeLatin, LATIN),
  face('Figtree Variable', 'normal', '300 900', figtreeLatinExt, LATIN_EXT),
].join('\n\n')
