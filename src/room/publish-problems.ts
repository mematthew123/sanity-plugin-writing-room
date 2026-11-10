export interface Marker {
  level: 'error' | 'warning' | 'info'
  path: unknown[]
  message: string
}

export type ProblemTarget =
  | {kind: 'title'}
  | {kind: 'body'}
  | {kind: 'block'; key: string; field?: string}
  | {kind: 'details'}

export interface PublishProblem {
  target: ProblemTarget
  message: string
}

function isKeyed(segment: unknown): segment is {_key: string} {
  return typeof segment === 'object' && segment !== null && typeof (segment as {_key?: unknown})._key === 'string'
}

function targetFor(path: unknown[], fields: {title: string; body: string}): ProblemTarget {
  const [field, item, child] = path
  if (field === fields.title) return {kind: 'title'}
  if (field !== fields.body) return {kind: 'details'}
  if (!isKeyed(item)) return {kind: 'body'}
  return typeof child === 'string' && child !== 'markDefs' && child !== 'children'
    ? {kind: 'block', key: item._key, field: child}
    : {kind: 'block', key: item._key}
}

const ORDER: Record<ProblemTarget['kind'], number> = {title: 0, body: 1, block: 1, details: 2}

/** The validation errors that block a publish, each with where in the room the Writer can fix it. */
export function publishProblems(
  markers: Marker[],
  fields: {title: string; body: string} = {title: 'title', body: 'body'},
): PublishProblem[] {
  return markers
    .filter((marker) => marker.level === 'error')
    .map((marker) => ({target: targetFor(marker.path, fields), message: marker.message}))
    .sort((a, b) => ORDER[a.target.kind] - ORDER[b.target.kind])
}
