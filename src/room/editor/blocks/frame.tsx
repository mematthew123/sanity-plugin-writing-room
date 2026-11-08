import styled from 'styled-components'
import {Isolate} from '../isolate'

/** The outer wrapper every body object shares: spacing, and a soft ring when selected. */
export const BlockFrame = styled.div<{$selected?: boolean}>`
  position: relative;
  margin-block: var(--calm-type-prose-gap);
  border-radius: var(--calm-radius-large);
  outline: 2px solid ${({$selected}) => ($selected ? 'var(--calm-color-accent)' : 'transparent')};
  outline-offset: 4px;
  transition: outline-color var(--calm-motion-gentle) var(--calm-motion-easing);

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`

/** A quiet Figtree input that looks like a placeholder line until it's used. */
export const FieldInput = styled.input`
  display: block;
  box-sizing: border-box;
  width: 100%;
  padding: var(--calm-space-xs) 0;
  border: 0;
  background: transparent;
  color: var(--calm-color-ink-muted);
  font-family: var(--calm-font-ui);
  font-size: var(--calm-type-ui-size);
  outline: none;

  &::placeholder {
    color: var(--calm-color-ink-muted);
    opacity: 0.85;
  }

  &:focus {
    color: var(--calm-color-ink);
  }
`

export const Controls = styled(Isolate)`
  margin-top: var(--calm-space-sm);
`

/** A small caution-toned message that stays until resolved. */
export const Caution = styled.p`
  margin: var(--calm-space-xs) 0 0;
  color: var(--calm-color-caution);
  font-family: var(--calm-font-ui);
  font-size: var(--calm-type-ui-size-small);
`
