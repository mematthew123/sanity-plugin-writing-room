import {type EditorSchema, useEditor, useEditorSelector} from '@portabletext/editor'
import {useMemo} from 'react'

/** Each room block's names: the prefixed one the plugin registers, then the unprefixed one. */
export const ROOM_BLOCKS = {
  embed: ['writingRoomEmbed', 'embed'],
  codeBlock: ['writingRoomCodeBlock', 'codeBlock'],
  sectionBreak: ['writingRoomSectionBreak', 'sectionBreak'],
} as const

export type RoomBlock = keyof typeof ROOM_BLOCKS

export const ROOM_BLOCK_NAMES = new Set<string>(Object.values(ROOM_BLOCKS).flat())

/** What the body type can store, so the room's tools offer nothing else. */
export interface BodyAllows {
  style: (name: string) => boolean
  list: (name: string) => boolean
  decorator: (name: string) => boolean
  annotation: (name: string) => boolean
  block: (name: string) => boolean
  blockField: (block: string, field: string) => boolean
  /** This body's name for a room block, if it has one. */
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

/** Must sit inside an `EditorProvider`. */
export function useBodyAllows(): BodyAllows {
  const editor = useEditor()
  const schema = useEditorSelector(editor, (snapshot) => snapshot.context.schema)
  return useMemo(() => bodyAllows(schema), [schema])
}
