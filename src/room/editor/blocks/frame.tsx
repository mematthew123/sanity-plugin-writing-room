import {type ComponentProps, type ReactNode} from 'react'
import {cx} from '../../../lib/cx'
import {Isolate} from '../isolate'
import styles from './frame.module.css'

export function BlockFrame({
  selected,
  className,
  ...props
}: {selected?: boolean} & ComponentProps<'div'>) {
  return <div {...props} className={cx(styles.frame, className)} data-selected={selected || undefined} />
}

export function FieldInput(props: ComponentProps<'input'>) {
  return <input {...props} className={styles.input} />
}

export function Controls({children, className}: {children: ReactNode; className?: string}) {
  return <Isolate className={cx(styles.controls, className)}>{children}</Isolate>
}

export function Caution(props: ComponentProps<'p'>) {
  return <p {...props} className={styles.caution} />
}
