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

export function FieldInput({className, ...props}: ComponentProps<'input'>) {
  return <input {...props} className={cx(styles.input, className)} />
}

export function Controls({children, className}: {children: ReactNode; className?: string}) {
  return <Isolate className={cx(styles.controls, className)}>{children}</Isolate>
}

export function Caution({className, ...props}: ComponentProps<'p'>) {
  return <p {...props} className={cx(styles.caution, className)} />
}
