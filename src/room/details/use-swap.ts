import {type RefObject, useEffect, useLayoutEffect, useRef, useState} from 'react'
import {motion} from '../../tokens'

export type RoomViewName = 'prose' | 'details'

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Swaps the body for Details in two steps: the one on screen fades out, then the other comes in.
 * The Prose's scroll position is kept for the way back, and Details always opens at the top.
 */
export function useSwap(target: RoomViewName, page: RefObject<HTMLElement | null>, onBackToProse: () => void) {
  const [shown, setShown] = useState(target)
  const [swapped, setSwapped] = useState(false)
  const proseScroll = useRef(0)
  const leaving = shown !== target

  useEffect(() => {
    if (!leaving) return undefined
    const scroller = page.current?.closest<HTMLElement>('[data-calm-surface]')
    if (target === 'details') proseScroll.current = scroller?.scrollTop ?? 0
    const timer = setTimeout(
      () => {
        setSwapped(true)
        setShown(target)
      },
      prefersReducedMotion() ? 0 : parseFloat(motion.press),
    )
    return () => clearTimeout(timer)
  }, [leaving, target, page])

  const backToProse = useRef(onBackToProse)
  useEffect(() => {
    backToProse.current = onBackToProse
  })

  useLayoutEffect(() => {
    if (!swapped) return undefined
    const scroller = page.current?.closest<HTMLElement>('[data-calm-surface]')
    const place = () => {
      if (scroller) scroller.scrollTop = shown === 'details' ? 0 : proseScroll.current
    }
    // Focus first: it brings the caret into view, and the Writer's own scroll position has the last word.
    if (shown === 'prose') backToProse.current()
    place()
    const frame = requestAnimationFrame(place)
    return () => cancelAnimationFrame(frame)
  }, [shown, swapped, page])

  // Once it has arrived, nothing is left animating: a finished animation that still holds a
  // transform would go on positioning anything fixed inside it.
  useEffect(() => {
    if (!swapped) return undefined
    const timer = setTimeout(() => setSwapped(false), prefersReducedMotion() ? 0 : parseFloat(motion.gentle))
    return () => clearTimeout(timer)
  }, [swapped, shown])

  return {shown, leaving, entering: swapped && !leaving}
}
