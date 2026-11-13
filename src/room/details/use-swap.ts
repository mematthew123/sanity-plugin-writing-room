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
    if (!swapped) return
    const scroller = page.current?.closest<HTMLElement>('[data-calm-surface]')
    if (scroller) scroller.scrollTop = shown === 'details' ? 0 : proseScroll.current
    if (shown === 'prose') backToProse.current()
  }, [shown, swapped, page])

  return {shown, leaving, entering: swapped && !leaving}
}
