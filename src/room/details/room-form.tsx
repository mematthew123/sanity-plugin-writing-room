import {CloseIcon} from '@sanity/icons/Close'
import {createContext, type KeyboardEvent, useContext, useLayoutEffect, useRef, useState} from 'react'
import {
  type FieldProps,
  type InputProps,
  isArrayOfPrimitivesInputProps,
  isBooleanInputProps,
  isNumberInputProps,
  isObjectInputProps,
  isStringInputProps,
  set,
  unset,
} from 'sanity'
import styled from 'styled-components'
import {Switch} from '../primitives'
import {hasRoomChrome, roomInputKind} from './input-kind'
import {addTags, fromLocalDateTime, parseNumber, toLocalDateTime} from './values'

/** True only inside the room's Details view, so the overrides below leave the Structure form alone. */
export const InRoomDetails = createContext(false)

/** The room's label, description and validation message for simple fields; the rest keep Sanity's. */
export function RoomField(props: FieldProps) {
  const inRoom = useContext(InRoomDetails)
  if (!inRoom || !hasRoomChrome(props.schemaType)) return props.renderDefault(props)

  const problem = props.validation.find((marker) => marker.level === 'error') ?? props.validation[0]
  const isSwitch = roomInputKind(props.schemaType) === 'boolean'
  return (
    <Field data-calm-details-field={props.name}>
      {isSwitch ? (
        <SwitchRow>
          <Label htmlFor={props.inputId}>{props.title}</Label>
          {props.children}
        </SwitchRow>
      ) : (
        <Label htmlFor={props.inputId}>{props.title}</Label>
      )}
      {props.description && <Hint>{props.description}</Hint>}
      {!isSwitch && props.children}
      {problem && <Problem data-level={problem.level}>{problem.message}</Problem>}
    </Field>
  )
}

/** The room's own inputs for simple fields. A Studio's custom input, and anything complex, keeps Sanity's. */
export function RoomInput(props: InputProps) {
  const inRoom = useContext(InRoomDetails)
  const kind = inRoom ? roomInputKind(props.schemaType) : null

  if (kind === 'string' && isStringInputProps(props)) {
    return <TextInput {...props.elementProps} type="text" />
  }
  if (kind === 'text' && isStringInputProps(props)) {
    return <GrowingText {...props.elementProps} />
  }
  if (kind === 'date' && isStringInputProps(props)) {
    return <TextInput {...props.elementProps} type="date" />
  }
  if (kind === 'datetime' && isStringInputProps(props)) {
    const {elementProps, onChange} = props
    return (
      <TextInput
        id={elementProps.id}
        ref={elementProps.ref}
        onFocus={elementProps.onFocus}
        onBlur={elementProps.onBlur}
        readOnly={elementProps.readOnly}
        type="datetime-local"
        value={toLocalDateTime(props.value)}
        onChange={(event) => {
          const iso = fromLocalDateTime(event.currentTarget.value)
          onChange(iso ? set(iso) : unset())
        }}
      />
    )
  }
  if (kind === 'number' && isNumberInputProps(props)) {
    const {elementProps, onChange} = props
    return (
      <NumberField
        id={elementProps.id}
        inputRef={elementProps.ref}
        onFocus={elementProps.onFocus}
        onBlur={elementProps.onBlur}
        readOnly={elementProps.readOnly}
        value={props.value}
        onChange={(number) => onChange(number === undefined ? unset() : set(number))}
      />
    )
  }
  if (kind === 'boolean' && isBooleanInputProps(props)) {
    const {elementProps, onChange} = props
    return (
      <Switch
        id={elementProps.id}
        ref={elementProps.ref}
        onFocus={elementProps.onFocus}
        onBlur={elementProps.onBlur}
        disabled={props.readOnly}
        type="checkbox"
        role="switch"
        checked={props.value === true}
        onChange={(event) => onChange(set(event.currentTarget.checked))}
      />
    )
  }
  if (kind === 'slug' && isObjectInputProps(props)) {
    const {elementProps, onChange} = props
    const current = (props.value as {current?: string} | undefined)?.current ?? ''
    return (
      <TextInput
        id={elementProps.id}
        ref={elementProps.ref}
        onFocus={elementProps.onFocus}
        onBlur={elementProps.onBlur}
        readOnly={props.readOnly}
        type="text"
        spellCheck={false}
        autoCapitalize="none"
        value={current}
        onChange={(event) => {
          const next = event.currentTarget.value
          onChange(next ? set({_type: props.schemaType.name, current: next}) : unset())
        }}
      />
    )
  }
  if (kind === 'tags' && isArrayOfPrimitivesInputProps(props)) {
    const {elementProps, onChange} = props
    return (
      <TagsField
        id={elementProps.id}
        onFocus={elementProps.onFocus}
        onBlur={elementProps.onBlur}
        readOnly={props.readOnly}
        tags={(props.value ?? []).filter((tag): tag is string => typeof tag === 'string')}
        onChange={(tags) => onChange(tags.length > 0 ? set(tags) : unset())}
      />
    )
  }
  return props.renderDefault(props)
}

/** As tall as its text, like the title. */
function GrowingText(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {ref?: React.Ref<HTMLTextAreaElement>}) {
  const {ref, ...rest} = props
  const own = useRef<HTMLTextAreaElement | null>(null)

  useLayoutEffect(() => {
    const el = own.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [props.value])

  return (
    <TextArea
      {...rest}
      rows={2}
      ref={(node) => {
        own.current = node
        if (typeof ref === 'function') ref(node)
        else if (ref) ref.current = node
      }}
    />
  )
}

/** Keeps what was typed while it isn't a number yet ("-", "1."), and saves only real numbers. */
function NumberField({
  value,
  onChange,
  inputRef,
  ...rest
}: {
  value: number | undefined
  onChange: (value: number | undefined) => void
  inputRef?: React.Ref<HTMLInputElement>
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [typed, setTyped] = useState<string | null>(null)

  return (
    <TextInput
      {...rest}
      ref={inputRef}
      type="text"
      inputMode="decimal"
      value={typed ?? (value === undefined ? '' : String(value))}
      onChange={(event) => {
        setTyped(event.currentTarget.value)
        onChange(parseNumber(event.currentTarget.value))
      }}
      onBlur={(event) => {
        setTyped(null)
        rest.onBlur?.(event)
      }}
    />
  )
}

/** Enter or a comma adds a tag; Backspace in an empty field takes the last one away. */
function TagsField({
  tags,
  onChange,
  readOnly,
  ...rest
}: {
  tags: string[]
  onChange: (tags: string[]) => void
  readOnly?: boolean
} & Pick<React.InputHTMLAttributes<HTMLInputElement>, 'id' | 'onFocus' | 'onBlur'>) {
  const [typed, setTyped] = useState('')

  function commit() {
    if (!typed.trim()) return
    onChange(addTags(tags, typed))
    setTyped('')
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      commit()
    } else if (event.key === 'Backspace' && typed === '' && tags.length > 0) {
      onChange(tags.slice(0, -1))
    }
  }

  return (
    <Tags>
      {tags.map((tag) => (
        <Tag key={tag}>
          {tag}
          {!readOnly && (
            <RemoveTag
              type="button"
              aria-label={`Remove ${tag}`}
              onClick={() => onChange(tags.filter((other) => other !== tag))}
            >
              <CloseIcon aria-hidden />
            </RemoveTag>
          )}
        </Tag>
      ))}
      {!readOnly && (
        <TagInput
          {...rest}
          type="text"
          value={typed}
          onChange={(event) => setTyped(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
          onBlur={(event) => {
            commit()
            rest.onBlur?.(event)
          }}
        />
      )}
    </Tags>
  )
}

const Field = styled.div`
  display: grid;
  gap: var(--calm-space-xs);
`

const SwitchRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--calm-space-md);
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
  color-scheme: inherit;
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

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`

const TextArea = styled(TextInput).attrs({as: 'textarea'})`
  display: block;
  overflow: hidden;
  resize: none;
  line-height: var(--calm-type-prose-leading);
`

const Tags = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--calm-space-xs);
  padding: var(--calm-space-xs) 0;
  border-bottom: 1px solid var(--calm-color-rule);
  transition: border-color var(--calm-motion-gentle) var(--calm-motion-easing);

  &:focus-within {
    border-bottom-color: var(--calm-color-accent);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`

const Tag = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px var(--calm-space-xs) 2px var(--calm-space-sm);
  border-radius: var(--calm-radius-pill);
  background: var(--calm-color-surface);
  color: var(--calm-color-ink);
  font-family: var(--calm-font-ui);
  font-size: var(--calm-type-ui-size);
`

const RemoveTag = styled.button`
  display: inline-flex;
  padding: 2px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--calm-color-ink-muted);
  cursor: pointer;

  &:hover {
    color: var(--calm-color-ink);
  }

  &:focus-visible {
    outline: 2px solid var(--calm-color-accent);
    outline-offset: 1px;
  }
`

const TagInput = styled.input`
  flex: 1;
  min-width: 6rem;
  padding: var(--calm-space-xs) 0;
  border: 0;
  background: transparent;
  color: var(--calm-color-ink);
  font-family: var(--calm-font-prose);
  font-size: var(--calm-prose-size-medium);
  caret-color: var(--calm-color-accent);

  &:focus {
    outline: none;
  }
`
