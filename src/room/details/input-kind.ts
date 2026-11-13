import {type SchemaType} from 'sanity'

/** The fields the room draws an input of its own for. Everything else keeps Sanity's. */
export type RoomInputKind = 'string' | 'text' | 'number' | 'boolean' | 'date' | 'datetime' | 'slug' | 'tags'

function chain(type: SchemaType | undefined): SchemaType[] {
  const types: SchemaType[] = []
  for (let current = type; current; current = current.type) types.push(current)
  return types
}

const isOfType = (type: SchemaType, name: string) => chain(type).some((current) => current.name === name)

type Customised = {components?: {input?: unknown; field?: unknown}; options?: {list?: unknown; layout?: unknown}}

/** A Studio's own input or field component always wins over the room's. */
function hasOwn(type: SchemaType, part: 'input' | 'field'): boolean {
  return chain(type).some((current) => !!(current as Customised).components?.[part])
}

export function roomInputKind(type: SchemaType): RoomInputKind | null {
  if (hasOwn(type, 'input')) return null
  const options = (type as Customised).options
  if (isOfType(type, 'slug')) return 'slug'
  if (type.jsonType === 'array') {
    const members = 'of' in type ? type.of : []
    const onlyStrings = members.length > 0 && members.every((member) => member.jsonType === 'string')
    return options?.layout === 'tags' && onlyStrings ? 'tags' : null
  }
  // A list of choices is a select or radio buttons, which Sanity already draws.
  if (options?.list) return null
  if (type.jsonType === 'boolean') return 'boolean'
  if (type.jsonType === 'number') return 'number'
  if (type.jsonType !== 'string') return null
  if (isOfType(type, 'datetime')) return 'datetime'
  if (isOfType(type, 'date')) return 'date'
  if (isOfType(type, 'text')) return 'text'
  return ['string', 'url', 'email'].some((name) => isOfType(type, name)) ? 'string' : null
}

/** A web or email address, which is typed differently from a line of prose. */
export function addressKind(type: SchemaType): 'url' | 'email' | null {
  if (isOfType(type, 'url')) return 'url'
  return isOfType(type, 'email') ? 'email' : null
}

/** Whether the room draws the label, description and validation message around the input. */
export function hasRoomChrome(type: SchemaType): boolean {
  if (hasOwn(type, 'field')) return false
  return roomInputKind(type) !== null || ['string', 'number', 'boolean'].includes(type.jsonType)
}
