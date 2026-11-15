/**
 * The computed-style half of `pnpm vrt`. Elements are keyed by DOM position, never class name, so
 * renaming a hashed class changes nothing here unless it changes what the browser computed.
 */

export interface ElementSnapshot {
  /** For the report: `<p.prose> "Most of what I publish…"`. */
  descriptor: string
  /** `body>div:0>main:0>p:3`. */
  path: string
  styles: Record<string, string>
}

export const COMPARED_PROPERTIES = [
  'display',
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'z-index',
  'width',
  'height',
  'min-width',
  'min-height',
  'max-width',
  'max-height',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'gap',
  'grid-template-columns',
  'grid-template-rows',
  'grid-column',
  'grid-row',
  'flex-direction',
  'flex-wrap',
  'flex-grow',
  'flex-shrink',
  'flex-basis',
  'justify-content',
  'align-items',
  'overflow-x',
  'overflow-y',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'font-variation-settings',
  'font-feature-settings',
  'line-height',
  'letter-spacing',
  'text-align',
  'text-transform',
  'text-decoration-line',
  'text-decoration-color',
  'text-wrap',
  'white-space',
  'color',
  '-webkit-text-fill-color',
  'background-color',
  'background-image',
  'background-size',
  'background-position',
  'background-clip',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-radius',
  'outline',
  'outline-offset',
  'box-shadow',
  'opacity',
  'visibility',
  'transform',
  'filter',
  'backdrop-filter',
  'mix-blend-mode',
  'cursor',
  'pointer-events',
  'transition-property',
  'transition-duration',
  'transition-timing-function',
  // Not `animation-name`: CSS Modules rename keyframes, and a name paints nothing.
  'animation-duration',
]

export const PSEUDO_PROPERTIES = [
  'content',
  'display',
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'width',
  'height',
  'color',
  'background-color',
  'background-image',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-radius',
  'opacity',
  'transform',
]

/** Holds the page still for the screenshot. Added after the snapshot, which reads motion as written. */
export const STILL = `
*, *::before, *::after {
  animation-delay: 0s !important;
  animation-duration: 0s !important;
  animation-iteration-count: 1 !important;
  transition-delay: 0s !important;
  transition-duration: 0s !important;
  scroll-behavior: auto !important;
  caret-color: transparent !important;
}
`

/** Runs in the page. */
export function snapshotElements({
  comparedProperties,
  pseudoProperties,
  ignore,
}: {
  comparedProperties: string[]
  pseudoProperties: string[]
  /** A selector for what isn't the room's to answer for. */
  ignore?: string
}): ElementSnapshot[] {
  const skippedTags = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'TEMPLATE', 'TITLE'])
  const snapshots: ElementSnapshot[] = []
  const half = (value: number) => (Math.round(value * 2) / 2).toString()

  function read(computed: CSSStyleDeclaration, properties: string[], prefix: string, into: Record<string, string>) {
    for (const property of properties) {
      const value = computed.getPropertyValue(property).split(window.location.origin).join('')
      // A fade that has all but arrived reads 0.350001.
      into[`${prefix}${property}`] = property === 'opacity' ? Number(value).toFixed(2) : value
    }
  }

  function describe(element: Element): string {
    const classes = Array.from(element.classList).slice(0, 2).join('.')
    const ownText = Array.from(element.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent ?? '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 40)
    const label = element.getAttribute('aria-label')
    return `<${element.tagName.toLowerCase()}${classes ? `.${classes}` : ''}>${
      ownText ? ` "${ownText}"` : label ? ` [${label}]` : ''
    }`
  }

  function visit(element: Element, path: string) {
    const rect = element.getBoundingClientRect()
    const styles: Record<string, string> = {
      'box:x': half(rect.x),
      'box:y': half(rect.y),
      'box:width': half(rect.width),
      'box:height': half(rect.height),
    }
    read(getComputedStyle(element), comparedProperties, '', styles)
    for (const pseudo of ['::before', '::after']) {
      const computed = getComputedStyle(element, pseudo)
      const content = computed.getPropertyValue('content')
      if (content !== 'none' && content !== 'normal') read(computed, pseudoProperties, `${pseudo} `, styles)
    }
    snapshots.push({descriptor: describe(element), path, styles})
    visitChildren(element, path, new Map())
  }

  // An element with `display: contents` makes no box of its own: its children count as its parent's.
  function visitChildren(container: Element, parentPath: string, tagCounts: Map<string, number>) {
    for (const child of Array.from(container.children)) {
      // Skipped without being counted, so later siblings keep their paths.
      if (skippedTags.has(child.tagName) || (ignore && child.matches(ignore))) continue
      const tag = child.tagName.toLowerCase()
      if (getComputedStyle(child).display === 'contents') {
        visitChildren(child, parentPath, tagCounts)
        continue
      }
      const index = tagCounts.get(tag) ?? 0
      tagCounts.set(tag, index + 1)
      visit(child, `${parentPath}>${tag}:${index}`)
    }
  }

  visit(document.body, 'body')
  return snapshots
}
