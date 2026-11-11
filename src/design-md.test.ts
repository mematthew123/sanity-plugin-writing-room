import {readFileSync} from 'node:fs'
import {describe, expect, it} from 'vitest'
import {parse} from 'yaml'
import {fonts, layout, motion, palette, proseSize, space, type, weight} from './tokens'

/**
 * DESIGN.md mirrors the tokens for people and agents. The tokens are the source of truth; this
 * test fails when the two drift apart.
 */
const designMd = readFileSync(new URL('../DESIGN.md', import.meta.url), 'utf8')
const frontMatter = parse(designMd.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '')

const kebab = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)

describe('DESIGN.md front matter', () => {
  it('mirrors every palette colour, light and dark', () => {
    for (const [key, value] of Object.entries(palette.light)) {
      if (key === 'floatingShadow') continue
      expect(frontMatter.colors[kebab(key)], key).toBe(value)
    }
    for (const [key, value] of Object.entries(palette.dark)) {
      if (key === 'floatingShadow') continue
      expect(frontMatter.colors[`${kebab(key)}-dark`], `${key} (dark)`).toBe(value)
    }
  })

  it('mirrors the type scale and weights', () => {
    const t = frontMatter.typography
    expect(t.body.fontSize).toBe(proseSize.medium)
    expect(t['body-small'].fontSize).toBe(proseSize.small)
    expect(t['body-large'].fontSize).toBe(proseSize.large)
    expect(t.title.fontSize).toBe(type.title)
    expect(t.heading.fontSize).toBe(type.heading)
    expect(t.subheading.fontSize).toBe(type.subheading)
    expect(t.caption.fontSize).toBe(type.caption)
    expect(t.code.fontSize).toBe(type.code)
    expect(t.ui.fontSize).toBe(type.uiSize)
    expect(t['ui-small'].fontSize).toBe(type.uiSizeSmall)
    expect(String(t.body.lineHeight)).toBe(type.proseLeading)
    expect(String(t.heading.lineHeight)).toBe(type.headingLeading)
    expect(String(t.body.fontWeight)).toBe(weight.prose)
    expect(String(t.title.fontWeight)).toBe(weight.title)
    expect(String(t.heading.fontWeight)).toBe(weight.heading)
    expect(String(t.ui.fontWeight)).toBe(weight.ui)
    expect(String(t['ui-strong'].fontWeight)).toBe(weight.uiStrong)
  })

  it('names typefaces that the font stacks actually lead with', () => {
    const t = frontMatter.typography
    expect(fonts.prose).toContain(t.body.fontFamily)
    expect(fonts.ui).toContain(t.ui.fontFamily)
    expect(fonts.mono).toContain(t.code.fontFamily)
  })

  it('mirrors spacing, measure and radii', () => {
    for (const [key, value] of Object.entries(space)) {
      expect(frontMatter.spacing[key], key).toBe(value)
    }
    expect(frontMatter.spacing['prose-gap']).toBe(type.proseGap)
    expect(frontMatter.spacing.measure).toBe(layout.measure)
    expect(frontMatter.rounded).toEqual({
      sm: layout.radius,
      lg: layout.radiusLarge,
      pill: layout.radiusPill,
    })
  })

  it('mirrors motion', () => {
    expect(frontMatter.motion).toEqual(motion)
  })

  it('only references tokens that exist', () => {
    const refs = [...designMd.matchAll(/"\{(\w+)\.([\w-]+)\}"/g)]
    expect(refs.length).toBeGreaterThan(0)
    for (const [ref, group, name] of refs) {
      expect(frontMatter[group!]?.[name!], ref).toBeDefined()
    }
  })
})
