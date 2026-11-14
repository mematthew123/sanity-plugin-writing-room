import {type ComponentProps, type ComponentType, type ReactNode, type Ref} from 'react'
import {cx} from '../lib/cx'
import styles from './primitives.module.css'

/** The room's one scroller. Its scrollbar's space is always kept, so nothing moves sideways when a short page follows a long one. */
export function Surface({className, ...props}: ComponentProps<'div'>) {
  return <div {...props} className={cx(styles.surface, className)} />
}

export function Column({
  as: Tag = 'div',
  className,
  ref,
  ...props
}: {as?: 'div' | 'main' | 'article'; ref?: Ref<HTMLElement>} & Omit<ComponentProps<'div'>, 'ref'>) {
  // Whichever element it is, the ref is to an element.
  return <Tag {...props} ref={ref as Ref<HTMLDivElement>} className={cx(styles.column, className)} />
}

/** Shown only where there's room for it; elsewhere it isn't there at all. */
export function WideOnly({children}: {children: ReactNode}) {
  return <span className={styles.wideOnly}>{children}</span>
}

/**
 * Has paper behind it so Prose never shows through. Wrap what should fade while the Writer
 * types in {@link Recedes}; leave must-see notices unwrapped.
 */
export function RoomControls({
  start,
  end,
  receded = false,
}: {
  start?: ReactNode
  end?: ReactNode
  receded?: boolean
}) {
  return (
    <header className={styles.controlsBar} aria-label="Room controls" data-receded={receded}>
      <div className={styles.controlsGroup}>{start}</div>
      <div className={styles.controlsGroup}>{end}</div>
    </header>
  )
}

export function Recedes({children}: {children: ReactNode}) {
  return (
    <div className={styles.recedes} data-recedes="">
      {children}
    </div>
  )
}

export function QuietButton({
  icon: Icon,
  children,
  className,
  ...props
}: {icon?: ComponentType; children?: ReactNode; ref?: Ref<HTMLButtonElement>} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" {...props} className={cx(styles.quietButton, className)}>
      {Icon && <Icon aria-hidden />}
      {children}
    </button>
  )
}

export function SectionLabel({children, className, ...props}: ComponentProps<'h2'>) {
  return (
    <h2 {...props} className={cx(styles.sectionLabel, className)}>
      {children}
    </h2>
  )
}

export function Placeholder({
  height,
  className,
  style,
  ...props
}: {height: string} & ComponentProps<'div'>) {
  return <div {...props} className={cx(styles.placeholder, className)} style={{...style, height}} />
}

/** A checkbox drawn as a switch; give it `type="checkbox"` and `role="switch"`. */
export function Switch({className, ...props}: ComponentProps<'input'>) {
  return <input {...props} className={cx(styles.switch, className)} />
}
