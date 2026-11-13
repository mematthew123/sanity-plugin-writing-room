/**
 * Undefined for anything that isn't a plain decimal number. A comma counts as the decimal mark,
 * since that's the key a decimal keypad has in much of the world.
 */
export function parseNumber(raw: string): number | undefined {
  const text = raw.trim().replace(',', '.')
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(text)) return undefined
  const number = Number(text)
  return Number.isFinite(number) ? number : undefined
}

const pad = (value: number) => String(value).padStart(2, '0')

/** An ISO datetime as a `datetime-local` input wants it: the Writer's own time zone, to the minute. */
export function toLocalDateTime(iso: string | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${String(date.getFullYear()).padStart(4, '0')}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function fromLocalDateTime(local: string): string | undefined {
  if (!local) return undefined
  const date = new Date(local)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

/** Takes away the tag at `index`, and no other tag that happens to read the same. */
export function removeTagAt(tags: readonly string[], index: number): string[] {
  return tags.filter((_, at) => at !== index)
}

/** Adds what was typed as one or more tags (commas separate them), skipping blanks and repeats. */
export function addTags(tags: readonly string[], typed: string): string[] {
  const next = [...tags]
  for (const tag of typed.split(',').map((part) => part.trim())) {
    if (tag && !next.includes(tag)) next.push(tag)
  }
  return next
}
