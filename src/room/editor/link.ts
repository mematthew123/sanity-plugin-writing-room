const MAX_SHOWN = 40

export function normalizeHref(input: string): string | null {
  const href = input.trim()
  if (!href) return null
  if (/^(https?:|mailto:)/i.test(href)) return href
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(href)) return `mailto:${href}`
  return `https://${href}`
}

export function displayHref(href: string): string {
  const shown = href
    .replace(/^mailto:/i, '')
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/$/, '')
  return shown.length > MAX_SHOWN ? `${shown.slice(0, MAX_SHOWN - 1)}…` : shown
}
