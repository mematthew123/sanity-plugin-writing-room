import {type EditorSchema, useEditor, useEditorSelector} from '@portabletext/editor'
import {useMemo} from 'react'

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
