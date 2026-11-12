import {describe, expect, it} from 'vitest'
import {palette} from '../tokens'
import {contrast, parseHex, resolvePalette} from './accent'

const onPaper = (scheme: 'light' | 'dark', colour: string) =>
  contrast(parseHex(colour)!, parseHex(palette[scheme].paper)!)

describe('resolvePalette', () => {
  it('is the room’s own palette when no accent is given', () => {
    expect(resolvePalette()).toEqual(palette)
    expect(resolvePalette({})).toEqual(palette)
  })

  it('keeps an accent that is already readable exactly as given', () => {
    expect(resolvePalette({light: '#2F6FA8'}).light.accent).toBe('#2F6FA8')
  })

  it('changes only the scheme it is given for', () => {
    const colors = resolvePalette({light: '#2F6FA8'})
    expect(colors.dark).toEqual(palette.dark)
    expect(colors.light.paper).toBe(palette.light.paper)
  })

  it('uses one colour for both schemes, made readable on each paper', () => {
    const colors = resolvePalette('#2F6FA8')
    expect(colors.light.accent).toBe('#2F6FA8')
    expect(colors.dark.accent).not.toBe('#2F6FA8')
    expect(onPaper('dark', colors.dark.accent)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(['#FFE066', '#FFFFFF', '#000000', '#7F7F7F', '#0B3D91', '#F0F'])(
    'makes %s readable in both schemes, with readable text on it',
    (accent) => {
      const colors = resolvePalette(accent)
      for (const scheme of ['light', 'dark'] as const) {
        const resolved = colors[scheme]
        expect(onPaper(scheme, resolved.accent)).toBeGreaterThanOrEqual(4.5)
        expect(contrast(parseHex(resolved.onAccent)!, parseHex(resolved.accent)!)).toBeGreaterThanOrEqual(4.5)
      }
    },
  )

  it('tints the selection with the accent', () => {
    expect(resolvePalette({light: '#2F6FA8'}).light.selection).toBe('rgba(47, 111, 168, 0.18)')
  })

  it('says so when the accent is not a hex colour', () => {
    expect(() => resolvePalette('cornflowerblue')).toThrow(/hex colour/)
  })
})
