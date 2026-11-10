import {type EditorSchema, useEditor, useEditorSelector} from '@portabletext/editor'
import {useMemo} from 'react'

/**
 * The room's own block types, each under the name the plugin registers (prefixed, so it can't
 * clash) and the starter schema's original name (which the template's content already uses).
 */
export const ROOM_BLOCKS = {
  embed: ['writingRoomEmbed', 'embed'],
  codeBlock: ['writingRoomCodeBlock', 'codeBlock'],
  sectionBreak: ['writingRoomSectionBreak', 'sectionBreak'],
} as const

export type RoomBlock = keyof typeof ROOM_BLOCKS

/** Every name the room renders as one of its own blocks. */
export const ROOM_BLOCK_NAMES = new Set<string>(Object.values(ROOM_BLOCKS).flat())

/**
 * What the document's body type lets the Writer add, so the room's tools only offer what the
 * Studio can store. A Studio's `blockContent` without code blocks gets no Code block command.
 */
export interface BodyAllows {
  style: (name: string) => boolean
  list: (name: string) => boolean
  decorator: (name: string) => boolean
  annotation: (name: string) => boolean
  /** A block object type: `image`, `embed`, `codeBlock`… */
  block: (name: string) => boolean
  /** A field on a block object type, e.g. an image's `alt` or `caption`. */
  blockField: (block: string, field: string) => boolean
  /** The name this body uses for one of the room's own blocks, if it has it. */
  roomBlock: (block: RoomBlock) => string | undefined
}

export function bodyAllows(schema: EditorSchema): BodyAllows {
  const names = (items: ReadonlyArray<{name: string}>) => new Set(items.map((item) => item.name))
  const styles = names(schema.styles)
  const lists = names(schema.lists)
  const decorators = names(schema.decorators)
  const annotations = names(schema.annotations)
  const blocks = names(schema.blockObjects)
  return {
    style: (name) => styles.has(name),
    list: (name) => lists.has(name),
    decorator: (name) => decorators.has(name),
    annotation: (name) => annotations.has(name),
    block: (name) => blocks.has(name),
    roomBlock: (block) => ROOM_BLOCKS[block].find((name) => blocks.has(name)),
    blockField: (block, field) =>
      !!schema.blockObjects
        .find((candidate) => candidate.name === block)
        ?.fields?.some((candidate) => candidate.name === field),
  }
}

/** What the body being edited allows. Must sit inside an `EditorProvider`. */
export function useBodyAllows(): BodyAllows {
  const editor = useEditor()
  const schema = useEditorSelector(editor, (snapshot) => snapshot.context.schema)
  return useMemo(() => bodyAllows(schema), [schema])
}
