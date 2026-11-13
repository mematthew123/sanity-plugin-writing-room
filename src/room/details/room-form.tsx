import {CloseIcon} from '@sanity/icons/Close'
import {
  createContext,
  type KeyboardEvent,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import {
  type FieldProps,
  type InputProps,
  insert,
  isArrayOfPrimitivesInputProps,
  isBooleanInputProps,
  isNumberInputProps,
  isObjectInputProps,
  isStringInputProps,
  set,
  setIfMissing,
  unset,
} from 'sanity'
import styled, {css} from 'styled-components'
import {Switch} from '../primitives'
import {addressKind, hasRoomChrome, roomInputKind} from './input-kind'
import {slugByHand} from './slug-by-hand'
import {addTags, fromLocalDateTime, parseNumber, removeTagAt, toLocalDateTime} from './values'

/** True only inside the room's Details view, so the overrides below leave the Structure form alone. */
export const InRoomDetails = createContext(false)

/** The id of the document Details is showing, without `drafts.`. */
export const DetailsDocument = createContext<string | null>(null)

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

/** Addresses aren't prose: no capitals, no spelling corrections, and the keyboard made for them. */
const ADDRESS = {
  url: {inputMode: 'url', autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false},
  email: {inputMode: 'email', autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false},
} as const

/** The room's own inputs for simple fields. A Studio's custom input, and anything complex, keeps Sanity's. */
export function RoomInput(props: InputProps) {
  const inRoom = useContext(InRoomDetails)
  const documentId = useContext(DetailsDocument)
  const kind = inRoom ? roomInputKind(props.schemaType) : null

  if (kind === 'string' && isStringInputProps(props)) {
    const address = addressKind(props.schemaType)
    return <TextInput {...props.elementProps} {...(address ? ADDRESS[address] : {})} type="text" />
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
        {...elementProps}
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
        {...elementProps}
        value={props.value}
        onChange={(number) => onChange(number === undefined ? unset() : set(number))}
      />
    )
  }
  if (kind === 'boolean' && isBooleanInputProps(props)) {
    const {onChange} = props
    // A checkbox has no text value of its own to be given.
    const {value: _value, ...elementProps} = props.elementProps
    return (
      <Switch
        {...elementProps}
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
        {...elementProps}
        readOnly={props.readOnly}
        type="text"
        spellCheck={false}
        autoCapitalize="none"
        value={current}
        onChange={(event) => {
          const next = event.currentTarget.value
          // The title is told at once, so it doesn't take this for a slug that still follows it.
          if (documentId && props.path.length === 1) slugByHand.note(documentId, next)
          // Only `current` is the room's to write: anything else kept on the slug stays.
          onChange(next ? [setIfMissing({_type: props.schemaType.name}), set(next, ['current'])] : unset())
        }}
      />
    )
  }
  // Tags are told apart by where they are, so a list holding something other than text is Sanity's.
  if (
    kind === 'tags' &&
    isArrayOfPrimitivesInputProps(props) &&
    (props.value ?? []).every((tag) => typeof tag === 'string')
  ) {
    const {elementProps, onChange} = props
    return (
      <TagsField
        {...elementProps}
        readOnly={props.readOnly}
        tags={(props.value ?? []) as string[]}
        // Added at the end, whatever the list has become since: two people adding tags both keep theirs.
        onAdd={(added) => onChange([setIfMissing([]), insert(added, 'after', [-1])])}
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

  const fit = useCallback(() => {
    const el = own.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])

  useLayoutEffect(fit, [fit, props.value])

  // The same words take more lines in a narrower column, or once the prose font has loaded.
  useEffect(() => {
    const el = own.current
    if (!el) return undefined
    let width = el.clientWidth
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return
      width = el.clientWidth
      fit()
    })
    observer.observe(el)
    let gone = false
    void document.fonts?.ready.then(() => {
      if (!gone) fit()
    })
    return () => {
      gone = true
      observer.disconnect()
    }
  }, [fit])

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

/**
 * Keeps what was typed while it isn't a number yet ("-", "1."), and saves only real numbers.
 * Emptying the field unsets it; text that can't be read leaves the saved number as it was.
 */
function NumberField({
  value,
  onChange,
  ref,
  ...rest
}: {
  value: number | undefined
  onChange: (value: number | undefined) => void
  ref?: React.Ref<HTMLInputElement>
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [typed, setTyped] = useState<string | null>(null)

  return (
    <TextInput
      {...rest}
      ref={ref}
      type="text"
      inputMode="decimal"
      value={typed ?? (value === undefined ? '' : String(value))}
      onChange={(event) => {
        const text = event.currentTarget.value
        setTyped(text)
        const number = parseNumber(text)
        if (number !== undefined || text.trim() === '') onChange(number)
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
  onAdd,
  onChange,
  readOnly,
  ref,
  ...rest
}: {
  tags: string[]
  onAdd: (added: string[]) => void
  onChange: (tags: string[]) => void
  readOnly?: boolean
  ref?: React.Ref<HTMLInputElement>
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'readOnly'>) {
  const [typed, setTyped] = useState('')

  function commit() {
    if (!typed.trim()) return
    const added = addTags(tags, typed).slice(tags.length)
    if (added.length > 0) onAdd(added)
    setTyped('')
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      commit()
    } else if (event.key === 'Backspace' && !event.repeat && typed === '' && tags.length > 0) {
      // A held key that has just finished erasing what was typed mustn't carry on into the tags.
      onChange(tags.slice(0, -1))
    }
  }

  return (
    <Tags>
      {tags.map((tag, index) => (
        // eslint-disable-next-line @eslint-react/no-array-index-key -- a tag has no identity but its place
        <Tag key={`${index}:${tag}`}>
          {tag}
          {!readOnly && (
            <RemoveTag
              type="button"
              aria-label={`Remove ${tag}`}
              onClick={() => onChange(removeTagAt(tags, index))}
            >
              <CloseIcon aria-hidden />
            </RemoveTag>
          )}
        </Tag>
      ))}
      {!readOnly && (
        <TagInput
          {...rest}
          ref={ref}
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

/** How anything typed in Details looks: the prose face, on the paper, with the room's caret. */
const entry = css`
  border: 0;
  background: transparent;
  color: var(--calm-color-ink);
  color-scheme: inherit;
  font-family: var(--calm-font-prose);
  font-size: var(--calm-prose-size-medium);
  caret-color: var(--calm-color-accent);

  &:read-only {
    color: var(--calm-color-ink-muted);
  }
`

const TextInput = styled.input`
  ${entry}
  box-sizing: border-box;
  width: 100%;
  padding: var(--calm-space-sm) 0;
  border-bottom: 1px solid var(--calm-color-rule);
  border-radius: 0;
  transition: border-color var(--calm-motion-gentle) var(--calm-motion-easing);

  &:focus {
    outline: none;
    border-bottom-color: var(--calm-color-accent);
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
  ${entry}
  flex: 1;
  min-width: 6rem;
  padding: var(--calm-space-xs) 0;

  &:focus {
    outline: none;
  }
`
