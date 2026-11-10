import {useEditor} from '@portabletext/editor'
import {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react'

const WRITE_DELAY = 400

/** Local while typing; written after a pause, on blur and on unmount. Remote changes apply while not editing. */
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

  // Layout-effect cleanup runs before EditorProvider's passive cleanup stops the editor.
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
