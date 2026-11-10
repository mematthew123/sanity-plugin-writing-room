/// <reference path="../assets.d.ts" />
import {face, LATIN, LATIN_EXT, UI_FONT_FACES_CSS} from './fonts-ui'
import newsreaderLatinItalic from '@fontsource-variable/newsreader/files/newsreader-latin-wght-italic.woff2'
import newsreaderLatin from '@fontsource-variable/newsreader/files/newsreader-latin-wght-normal.woff2'
import newsreaderLatinExtItalic from '@fontsource-variable/newsreader/files/newsreader-latin-ext-wght-italic.woff2'
import newsreaderLatinExt from '@fontsource-variable/newsreader/files/newsreader-latin-ext-wght-normal.woff2'

/**
 * The room's typefaces, shipped with the plugin so no Studio has to install them: Newsreader
 * (prose, with a real italic) and Figtree (controls), Latin and Latin Extended. Other scripts fall
 * back to the token stacks (Georgia, the system UI font). Same family names as Fontsource, so a
 * Studio that already loads them gets the same fonts.
 */
export const FONT_FACES_CSS = [
  face('Newsreader Variable', 'normal', '200 800', newsreaderLatin, LATIN),
  face('Newsreader Variable', 'normal', '200 800', newsreaderLatinExt, LATIN_EXT),
  face('Newsreader Variable', 'italic', '200 800', newsreaderLatinItalic, LATIN),
  face('Newsreader Variable', 'italic', '200 800', newsreaderLatinExtItalic, LATIN_EXT),
  UI_FONT_FACES_CSS,
].join('\n\n')
