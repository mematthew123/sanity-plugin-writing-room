import {fonts, palette} from '@calm/tokens'
import {buildTheme} from '@sanity/themer'
import {type StudioTheme} from 'sanity'
import {type WritingRoomColors, type WritingRoomScheme} from './config'
import {UI_FONT_FACES_CSS} from './room/fonts-ui'

/**
 * An optional Studio theme that matches the Writing Room: the room's paper, warm neutrals and
 * clay accent, and Figtree for the Studio's text, so moving between the room and the rest of the
 * Studio isn't a jolt. Its own entry point (`sanity-plugin-writing-room/theme`), so only Studios
 * that use it need `@sanity/themer`.
 */

/** Figtree for the Studio's text, declared once in the browser (never during a build in Node). */
function loadUiFont() {
  if (typeof document === 'undefined' || document.getElementById('sanity-plugin-writing-room-ui-font')) return
  const style = document.createElement('style')
  style.id = 'sanity-plugin-writing-room-ui-font'
  style.textContent = UI_FONT_FACES_CSS
  document.head.append(style)
}

type ThemeFonts = ReturnType<typeof buildTheme>['fonts']

function withUiFont(font: ThemeFonts): ThemeFonts {
  return {
    ...font,
    text: {...font.text, family: fonts.ui},
    heading: {...font.heading, family: fonts.ui},
    label: {...font.label, family: fonts.ui},
  }
}

/**
 * The theme, with your colours if you changed the room's: pass the same `colors` you gave
 * `writingRoom()`, e.g. `createWritingRoomTheme({colors: {light: {accent: '#2F6FA8'}}})`.
 */
export function createWritingRoomTheme({
  colors = {},
}: {colors?: Partial<Record<WritingRoomScheme, WritingRoomColors>>} = {}): StudioTheme {
  loadUiFont()
  const light = {...palette.light, ...colors.light}
  const dark = {...palette.dark, ...colors.dark}
  const theme = buildTheme({
    light: {accent: light.accent, text: light.inkMuted, background: light.paper},
    // A step dimmer than the room's muted ink, so the Studio's chrome recedes behind the room.
    dark: {accent: dark.accent, text: colors.dark?.inkMuted ?? '#8F8478', background: dark.paper},
  })
  return {
    ...theme,
    fonts: withUiFont(theme.fonts),
    ...(theme.v2 && {v2: {...theme.v2, font: withUiFont(theme.v2.font)}}),
  }
}

/** The theme with the room's default colours: `defineConfig({theme: writingRoomTheme, …})`. */
export const writingRoomTheme: StudioTheme = createWritingRoomTheme()
