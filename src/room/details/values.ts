/** Undefined for anything that isn't a finite number, so an emptied field is unset rather than `NaN`. */
export function parseNumber(raw: string): number | undefined {
  if (raw.trim() === '') return undefined
  const number = Number(raw)
  return Number.isFinite(number) ? number : undefined
}

const pad = (value: number) => String(value).padStart(2, '0')

/** An ISO datetime as a `datetime-local` input wants it: the Writer's own time zone, to the minute. */
export function toLocalDateTime(iso: string | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function fromLocalDateTime(local: string): string | undefined {
  if (!local) return undefined
  const date = new Date(local)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

/** Adds what was typed as one or more tags (commas separate them), skipping blanks and repeats. */
export function addTags(tags: readonly string[], typed: string): string[] {
  const next = [...tags]
  for (const tag of typed.split(',').map((part) => part.trim())) {
    if (tag && !next.includes(tag)) next.push(tag)
  }
  return next
}
