import {type BlockObjectRenderProps} from '@portabletext/editor'
import {useLayoutEffect, useRef} from 'react'
import styled from 'styled-components'
import {CODE_LANGUAGES} from '../../../schema/objects/code-block'
import {useBlockField} from '../use-block-field'
import {BlockFrame, Controls} from './frame'

export function CodeBlock({attributes, children, node, selected, focused}: BlockObjectRenderProps) {
  const code = useBlockField(node._key, 'code', node.code)
  const language = useBlockField(node._key, 'language', node.language)
  const textarea = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const el = textarea.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [code.value])

  return (
    <BlockFrame {...attributes} data-calm-block={node._key} $selected={selected}>
      {children}
      <Card>
        <Language
          aria-label="Language"
          value={language.value || 'text'}
          onChange={(event) => {
            language.onChange(event.currentTarget.value)
            language.onBlur()
          }}
        >
          {CODE_LANGUAGES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.title}
            </option>
          ))}
        </Language>
        <Code
          ref={textarea}
           
          autoFocus={focused && !code.value}
          aria-label="Code"
          data-calm-field={`${node._key}.code`}
          spellCheck={false}
          rows={1}
          value={code.value}
          onChange={(event) => code.onChange(event.currentTarget.value)}
          onBlur={code.onBlur}
          onKeyDown={(event) => {
            // Tab indents; Shift+Tab is left to the browser so keyboard users can always move out.
            if (event.key === 'Tab' && !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey) {
              event.preventDefault()
              const el = event.currentTarget
              const {selectionStart, selectionEnd, value} = el
              const next = `${value.slice(0, selectionStart)}  ${value.slice(selectionEnd)}`
              code.onChange(next)
              requestAnimationFrame(() => el.setSelectionRange(selectionStart + 2, selectionStart + 2))
            }
          }}
        />
      </Card>
    </BlockFrame>
  )
}

const Card = styled(Controls)`
  position: relative;
  margin-top: 0;
  padding: var(--calm-space-md);
  border-radius: var(--calm-radius);
  background: var(--calm-color-surface);
`

const Language = styled.select`
  position: absolute;
  top: var(--calm-space-sm);
  right: var(--calm-space-sm);
  padding: var(--calm-space-xs) var(--calm-space-sm);
  border: 0;
  border-radius: var(--calm-radius-pill);
  background: transparent;
  color: var(--calm-color-ink-muted);
  font-family: var(--calm-font-ui);
  font-size: var(--calm-type-ui-size-small);
  cursor: pointer;

  &:hover,
  &:focus-visible {
    background: var(--calm-color-paper);
  }
`

const Code = styled.textarea`
  display: block;
  box-sizing: border-box;
  width: 100%;
  min-height: 1.6em;
  padding: 0;
  overflow: hidden;
  border: 0;
  background: transparent;
  color: var(--calm-color-ink);
  caret-color: var(--calm-color-accent);
  font-family: var(--calm-font-mono);
  font-size: var(--calm-type-code);
  line-height: 1.6;
  tab-size: 2;
  white-space: pre;
  overflow-x: auto;
  resize: none;
  outline: none;
`
