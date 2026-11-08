const IMAGE_REF = /^image-([A-Za-z0-9]+)-(\d+x\d+)-([a-z]+)$/

/** A Sanity CDN url for an image asset reference (`image-<hash>-<w>x<h>-<ext>`), sized for the room. */
export function imageUrl(
  ref: string | undefined,
  {projectId, dataset}: {projectId: string; dataset: string},
  {width}: {width?: number} = {},
): string | null {
  const match = ref?.match(IMAGE_REF)
  if (!match) return null
  const [, id, dimensions, format] = match
  const params = new URLSearchParams({...(width && {w: String(width)}), auto: 'format', fit: 'max'})
  return `https://cdn.sanity.io/images/${projectId}/${dataset}/${id}-${dimensions}.${format}?${params}`
}
