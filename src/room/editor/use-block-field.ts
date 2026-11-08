import {useEditor} from '@portabletext/editor'
import {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react'

const WRITE_DELAY = 400

/**
 * Edits one string field of a block object (an image's alt text, a Code Block's code…).
 * Typing stays local and smooth; the value is written to the Post shortly after the Writer
 * pauses, immediately on blur, and on unmount (e.g. leaving the Room mid-pause). Remote changes flow
 * in whenever the field isn't being edited.
 */
export function useBlockField(blockKey: string, field: string, remote: unknown) {
  const editor = useEditor()
  const remoteValue = typeof remote === 'string' ? remote : ''
  const [value, setValue] = useState(remoteValue)
  const latest = useRef(remoteValue)
  const editing = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    if (!editing.current) {
      latest.current = remoteValue
      setValue(remoteValue)
    }
  }, [remoteValue])

  const write = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = undefined
    editor.send({type: 'block.set', at: [{_key: blockKey}], props: {[field]: latest.current}})
  }, [editor, blockKey, field])

  // A layout-effect cleanup runs before EditorProvider's passive cleanup stops the editor, so a
  // pending write still reaches the Post when the Room unmounts.
  useLayoutEffect(
    () => () => {
      if (timer.current !== undefined) write()
    },
    [write],
  )

  return {
    value,
    onChange: (next: string) => {
      editing.current = true
      latest.current = next
      setValue(next)
      clearTimeout(timer.current)
      timer.current = setTimeout(write, WRITE_DELAY)
    },
    onBlur: () => {
      editing.current = false
      if (latest.current !== remoteValue) write()
    },
  }
}
