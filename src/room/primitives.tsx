import {type ComponentType, type ReactNode, type Ref} from 'react'
import styled from 'styled-components'

/** The room's one scroller. Its scrollbar's space is always kept, so nothing moves sideways when a short page follows a long one. */
export const Surface = styled.div`
  position: relative;
  height: 100%;
  overflow-y: auto;
  scrollbar-gutter: stable;
  background: var(--calm-color-paper);
  color: var(--calm-color-ink);
  font-family: var(--calm-font-ui);
  font-size: var(--calm-type-ui-size);
  font-weight: var(--calm-weight-ui);
  -webkit-font-smoothing: antialiased;

  &::selection,
  & *::selection {
    background: var(--calm-color-selection);
  }
`

/** A phone, or a window about that narrow. */
export const NARROW = '@media (max-width: 40rem)'

/** Too narrow for anything to sit in the margin beside the column. */
export const NO_MARGIN = '@media (max-width: 64rem)'

export const Column = styled.div`
  box-sizing: content-box;
  max-width: var(--calm-measure);
  margin-inline: auto;
  padding: var(--calm-space-xxl) var(--calm-space-lg) var(--calm-space-xxl);

  ${NARROW} {
    padding-block: var(--calm-space-lg) var(--calm-space-xl);
  }
`

/** Shown only where there's room for it; elsewhere it isn't there at all. */
export const WideOnly = styled.span`
  display: contents;

  ${NARROW} {
    display: none;
  }
`

const ControlsBar = styled.header`
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--calm-space-md);
  padding: var(--calm-space-md) var(--calm-space-lg) var(--calm-space-lg);
  /* Paper behind the controls, fading out below them, so Prose never scrolls through them. */
  background: linear-gradient(to bottom, var(--calm-color-paper) 60%, transparent);
  pointer-events: none;

  & > * {
    pointer-events: auto;
  }

  ${NARROW} {
    gap: var(--calm-space-sm);
    padding-inline: var(--calm-space-sm);
  }

  [data-recedes] {
    transition: opacity var(--calm-motion-recede) var(--calm-motion-easing);
  }

  &[data-receded='true'] [data-recedes] {
    opacity: 0.08;
  }

  &:focus-within [data-recedes] {
    opacity: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    [data-recedes] {
      transition: none;
    }
  }
`

const ControlsGroup = styled.div`
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: var(--calm-space-xs);

  /* The end group gives way first: its status text shortens before anything wraps. */
  &:last-child {
    flex-shrink: 1;
    min-width: 0;
  }
`

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
    <ControlsBar aria-label="Room controls" data-receded={receded}>
      <ControlsGroup>{start}</ControlsGroup>
      <ControlsGroup>{end}</ControlsGroup>
    </ControlsBar>
  )
}

const QuietButtonRoot = styled.button`
  display: inline-flex;
  align-items: center;
  gap: var(--calm-space-xs);
  min-height: 2.25rem;
  padding: var(--calm-space-sm) 0.75rem;
  border: 0;
  border-radius: var(--calm-radius-pill);
  background: transparent;
  color: var(--calm-color-ink-muted);
  font: inherit;
  cursor: pointer;
  transition:
    background-color var(--calm-motion-gentle) var(--calm-motion-easing),
    color var(--calm-motion-gentle) var(--calm-motion-easing),
    transform var(--calm-motion-press) var(--calm-motion-easing);

  &:hover,
  &:focus-visible {
    background: var(--calm-color-surface);
    color: var(--calm-color-ink);
  }

  &:focus-visible {
    outline: 2px solid var(--calm-color-accent);
    outline-offset: 2px;
  }

  svg {
    flex-shrink: 0;
    font-size: 1.25rem;
  }

  @media (prefers-reduced-motion: no-preference) {
    &:active {
      transform: scale(0.97);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`

const RecedesRoot = styled.div`
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: var(--calm-space-xs);
`

export function Recedes({children}: {children: ReactNode}) {
  return <RecedesRoot data-recedes="">{children}</RecedesRoot>
}

export function QuietButton({
  icon: Icon,
  children,
  ...props
}: {icon?: ComponentType; children?: ReactNode; ref?: Ref<HTMLButtonElement>} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <QuietButtonRoot type="button" {...props}>
      {Icon && <Icon aria-hidden />}
      {children}
    </QuietButtonRoot>
  )
}

export const SectionLabel = styled.h2`
  margin: 0 0 var(--calm-space-sm);
  color: var(--calm-color-ink-muted);
  font-family: var(--calm-font-ui);
  font-size: var(--calm-type-ui-size-small);
  font-weight: var(--calm-weight-ui-strong);
`

export const Placeholder = styled.div<{$height: string}>`
  height: ${({$height}) => $height};
  border-radius: var(--calm-radius-large);
  background: var(--calm-color-surface);
  opacity: 0.6;
`

/** A checkbox drawn as a switch; give it `type="checkbox"` and `role="switch"`. */
export const Switch = styled.input`
  position: relative;
  flex-shrink: 0;
  width: 2.25rem;
  height: 1.375rem;
  margin: 0;
  border-radius: var(--calm-radius-pill);
  background: var(--calm-color-ink-faint);
  appearance: none;
  cursor: pointer;
  transition: background-color var(--calm-motion-gentle) var(--calm-motion-easing);

  &::before {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: calc(1.375rem - 4px);
    height: calc(1.375rem - 4px);
    border-radius: 50%;
    background: var(--calm-color-paper);
    transition: transform var(--calm-motion-gentle) var(--calm-motion-easing);
  }

  &:checked {
    background: var(--calm-color-accent);
  }

  &:checked::before {
    transform: translateX(0.875rem);
  }

  &:focus-visible {
    outline: 2px solid var(--calm-color-accent);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    &,
    &::before {
      transition: none;
    }
  }
`
