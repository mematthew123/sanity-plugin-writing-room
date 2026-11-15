import {type BlockObjectRenderProps} from '@portabletext/editor'
import {useLayoutEffect, useRef} from 'react'
import {CODE_LANGUAGES} from '../../../schema/objects/code-block'
import {useBlockField} from '../use-block-field'
import {BlockFrame, Controls} from './frame'
import styles from './CodeBlock.module.css'

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
    <BlockFrame {...attributes} data-calm-block={node._key} selected={selected}>
      {children}
      <Controls className={styles.card}>
        <select
          className={styles.language}
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
        </select>
        <textarea
          className={styles.code}
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
            // Shift+Tab is left to the browser so keyboard users can always move out.
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
      </Controls>
    </BlockFrame>
  )
}
