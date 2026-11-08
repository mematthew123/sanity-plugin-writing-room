import {type RefObject, useEffect, useState} from 'react'

const KEYSTROKES_TO_RECEDE = 3
const PAUSE_TO_RETURN_MS = 2000
const POINTER_JITTER_PX = 4

/**
 * Room Controls recede once the Writer is typing (a few keystrokes in the title or body) and
 * return when they pause, move the pointer, or move keyboard focus into the controls.
 */
export function useRecede(writingArea: RefObject<HTMLElement | null>): boolean {
  const [receded, setReceded] = useState(false)

  useEffect(() => {
    let strokes = 0
    let pause: ReturnType<typeof setTimeout> | undefined
    let lastPointer: {x: number; y: number} | null = null

    const returnControls = () => {
      strokes = 0
      clearTimeout(pause)
      setReceded(false)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const area = writingArea.current
      if (!area || !(event.target instanceof Node) || !area.contains(event.target)) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key.length !== 1 && event.key !== 'Backspace' && event.key !== 'Enter') return
      strokes += 1
      if (strokes >= KEYSTROKES_TO_RECEDE) setReceded(true)
      clearTimeout(pause)
      pause = setTimeout(returnControls, PAUSE_TO_RETURN_MS)
    }

    const onPointerMove = (event: PointerEvent) => {
      const moved =
        lastPointer &&
        Math.hypot(event.clientX - lastPointer.x, event.clientY - lastPointer.y) > POINTER_JITTER_PX
      lastPointer = {x: event.clientX, y: event.clientY}
      if (moved) returnControls()
    }

    document.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('pointermove', onPointerMove)
    return () => {
      clearTimeout(pause)
      document.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('pointermove', onPointerMove)
    }
  }, [writingArea])

  return receded
}
