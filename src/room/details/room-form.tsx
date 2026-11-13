import {createContext, useContext} from 'react'
import {type FieldProps, type InputProps, isStringInputProps} from 'sanity'
import styled from 'styled-components'

/**
 * True only inside the room's Details view, so the overrides below leave the
 * Structure form alone.
 */
export const InRoomDetails = createContext(false)

const SIMPLE = new Set(['string', 'number', 'boolean'])

/** The room's chrome for simple fields; everything else keeps Sanity's. */
export function RoomField(props: FieldProps) {
  const inRoom = useContext(InRoomDetails)
  if (!inRoom || !SIMPLE.has(props.schemaType.jsonType)) return props.renderDefault(props)

  const problem = props.validation.find((marker) => marker.level === 'error') ?? props.validation[0]
  return (
    <Field data-calm-details-field={props.name}>
      <Label htmlFor={props.inputId}>{props.title}</Label>
      {props.description && <Hint>{props.description}</Hint>}
      {props.children}
      {problem && <Problem data-level={problem.level}>{problem.message}</Problem>}
    </Field>
  )
}

/** The room's own input for plain strings; lists, text areas and the rest keep Sanity's. */
export function RoomInput(props: InputProps) {
  const inRoom = useContext(InRoomDetails)
  const isPlainString =
    isStringInputProps(props) &&
    props.schemaType.name === 'string' &&
    !props.schemaType.options?.list
  if (!inRoom || !isPlainString) return props.renderDefault(props)
  return <TextInput {...props.elementProps} type="text" data-calm-details-input="" />
}

const Field = styled.div`
  display: grid;
  gap: var(--calm-space-xs);
`

const Label = styled.label`
  color: var(--calm-color-ink);
  font-family: var(--calm-font-ui);
  font-size: var(--calm-type-ui-size);
  font-weight: var(--calm-weight-ui-strong);
`

const Hint = styled.p`
  margin: 0;
  color: var(--calm-color-ink-muted);
  font-family: var(--calm-font-ui);
  font-size: var(--calm-type-ui-size-small);
`

const Problem = styled.p`
  margin: 0;
  color: var(--calm-color-ink-muted);
  font-family: var(--calm-font-ui);
  font-size: var(--calm-type-ui-size-small);

  &[data-level='error'] {
    color: var(--calm-color-caution);
  }
`

const TextInput = styled.input`
  box-sizing: border-box;
  width: 100%;
  padding: var(--calm-space-sm) 0;
  border: 0;
  border-bottom: 1px solid var(--calm-color-rule);
  border-radius: 0;
  background: transparent;
  color: var(--calm-color-ink);
  font-family: var(--calm-font-prose);
  font-size: var(--calm-prose-size-medium);
  caret-color: var(--calm-color-accent);
  transition: border-color var(--calm-motion-gentle) var(--calm-motion-easing);

  &:focus {
    outline: none;
    border-bottom-color: var(--calm-color-accent);
  }

  &:read-only {
    color: var(--calm-color-ink-muted);
  }
`
