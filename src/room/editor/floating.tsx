import {type ComponentProps, type ReactNode, useLayoutEffect, useRef, useState} from 'react'
import {createPortal} from 'react-dom'
import {cx} from '../../lib/cx'
import styles from './floating.module.css'

const GAP = 8
/** Also the gap `.surface` leaves in floating.module.css. */
const EDGE = 12

/** Flips to the other side when there's no room, and always stays inside the window. */
export function Floating({
  anchor,
  placement = 'above',
  align = 'center',
  scheme,
  children,
  ...props
}: {
  anchor: DOMRect
  placement?: 'above' | 'below'
  align?: 'center' | 'start'
  scheme: string
  children: ReactNode
} & React.HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{top: number; left: number} | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const {width, height} = el.getBoundingClientRect()
    const above = anchor.top - height - GAP
    const below = anchor.bottom + GAP
    const fitsAbove = above >= EDGE
    const fitsBelow = below + height <= window.innerHeight - EDGE
    const useAbove = placement === 'above' ? fitsAbove || !fitsBelow : fitsAbove && !fitsBelow
    const top = Math.max(EDGE, Math.min(useAbove ? above : below, window.innerHeight - height - EDGE))
    const ideal = align === 'center' ? anchor.left + anchor.width / 2 - width / 2 : anchor.left
    const left = Math.min(Math.max(EDGE, ideal), window.innerWidth - width - EDGE)
    setPosition({top, left})
  }, [anchor, placement, align])

  return createPortal(
    <div
      ref={ref}
      className={styles.root}
      data-calm-floating=""
      data-scheme={scheme}
      style={position ? {top: position.top, left: position.left} : {visibility: 'hidden'}}
      {...props}
    >
      {children}
    </div>,
    document.body,
  )
}

export function useViewportChanges(onChange: () => void) {
  useLayoutEffect(() => {
    window.addEventListener('scroll', onChange, true)
    window.addEventListener('resize', onChange)
    return () => {
      window.removeEventListener('scroll', onChange, true)
      window.removeEventListener('resize', onChange)
    }
  }, [onChange])
}

/** Never bigger than the window, so `Floating`'s clamp always fits it. */
export function FloatingSurface({round, className, ...props}: {round?: boolean} & ComponentProps<'div'>) {
  return <div {...props} className={cx(styles.surface, className)} data-round={round || undefined} />
}
