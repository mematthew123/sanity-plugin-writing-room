import {fonts, palette} from './tokens'
import {buildTheme} from '@sanity/themer'
import {type StudioTheme} from 'sanity'
import {type WritingRoomColors, type WritingRoomScheme} from './config'
import {UI_FONT_FACES_CSS} from './room/fonts-ui'

// A separate entry point, so only Studios that use the theme need `@sanity/themer`.

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

/** A Studio theme matching the room. Pass the same `colors` you gave `writingRoom()`. */
export function createWritingRoomTheme({
  colors = {},
}: {colors?: Partial<Record<WritingRoomScheme, WritingRoomColors>>} = {}): StudioTheme {
  loadUiFont()
  const light = {...palette.light, ...colors.light}
  const dark = {...palette.dark, ...colors.dark}
  const theme = buildTheme({
    light: {accent: light.accent, text: light.inkMuted, background: light.paper},
    // Dimmer than the room's muted ink, so the Studio's chrome recedes.
    dark: {accent: dark.accent, text: colors.dark?.inkMuted ?? '#8F8478', background: dark.paper},
  })
  return {
    ...theme,
    fonts: withUiFont(theme.fonts),
    ...(theme.v2 && {v2: {...theme.v2, font: withUiFont(theme.v2.font)}}),
  }
}

/** A Studio theme matching the room's default colours. */
export const writingRoomTheme: StudioTheme = createWritingRoomTheme()
