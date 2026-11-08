const MAX_SHOWN = 40

/** Turns what a Writer typed into a link the schema accepts: https, or mailto for an address. */
export function normalizeHref(input: string): string | null {
  const href = input.trim()
  if (!href) return null
  if (/^(https?:|mailto:)/i.test(href)) return href
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(href)) return `mailto:${href}`
  return `https://${href}`
}

/** A link as a Writer would say it: "example.com/notes", without protocol, www or trailing slash. */
export function displayHref(href: string): string {
  const shown = href
    .replace(/^mailto:/i, '')
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/$/, '')
  return shown.length > MAX_SHOWN ? `${shown.slice(0, MAX_SHOWN - 1)}…` : shown
}
