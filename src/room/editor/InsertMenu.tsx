import {useEditor, useEditorSelector} from '@portabletext/editor'
import {raise} from '@portabletext/editor/behaviors'
import {getFocusTextBlock, isSelectionCollapsed} from '@portabletext/editor/selectors'
import {getTextBlockText, isEmptyTextBlock} from '@portabletext/editor/utils'
import {defineTypeaheadPicker, useTypeaheadPicker} from '@portabletext/plugin-typeahead-picker'
import {AddIcon} from '@sanity/icons/Add'
import {useCallback, useEffect, useLayoutEffect, useMemo, useState} from 'react'
import styled from 'styled-components'
import {type BodyAllows, useBodyAllows} from './allows'
import {commandEvents, type InsertCommand, type InsertCommandId, matchCommands} from './commands'
import {Floating, FloatingSurface, useViewportChanges} from './floating'

/**
 * `/` at the start of an empty line opens the Insert Menu. Built per editor, since what it offers
 * depends on the body type (and the picker's matcher only sees what was typed).
 */
const slashPicker = (allows: BodyAllows) =>
  defineTypeaheadPicker<InsertCommand & {key: string}>({
    trigger: /^\//,
    keyword: /\w*/,
    guard: ({snapshot}) => {
      const focus = getFocusTextBlock(snapshot)
      return !!focus && !focus.node.listItem && getTextBlockText(focus.node) === '/'
    },
    getMatches: ({keyword}) => matchCommands(keyword, allows).map((command) => ({...command, key: command.id})),
    onSelect: [
      ({event}) => [
        raise({type: 'delete', at: event.patternSelection}),
        ...commandEvents(event.match.id).map((commandEvent) => raise(commandEvent)),
      ],
    ],
  })

/** True when the caret sits alone on an empty plain paragraph: the place to insert things. */
function useOnEmptyLine() {
  const editor = useEditor()
  return useEditorSelector(editor, (snapshot) => {
    if (!isSelectionCollapsed(snapshot)) return false
    const focus = getFocusTextBlock(snapshot)
    return (
      !!focus &&
      !focus.node.listItem &&
      (!focus.node.style || focus.node.style === 'normal') &&
      isEmptyTextBlock(snapshot.context, focus.node)
    )
  })
}

/**
 * The Insert Menu: a faint `+` in the margin of an empty line (click it, or type `/`) opens a
 * short list of things to add.
 */
export function InsertMenu({scheme, editorFocused}: {scheme: string; editorFocused: boolean}) {
  const editor = useEditor()
  const onEmptyLine = useOnEmptyLine()
  const selection = useEditorSelector(editor, (snapshot) => snapshot.context.selection)
  const allows = useBodyAllows()
  const commands = useMemo(() => matchCommands('', allows), [allows])
  const picker = useTypeaheadPicker(useMemo(() => slashPicker(allows), [allows]))
  const [lineRect, setLineRect] = useState<DOMRect | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  const showPlus = editorFocused && onEmptyLine && commands.length > 0 && picker.snapshot.matches('idle')

  const measure = useCallback(() => {
    const block = showPlus || menuOpen ? editor.dom.getStartBlockElement(editor.getSnapshot()) : null
    setLineRect(block ? block.getBoundingClientRect() : null)
  }, [editor, showPlus, menuOpen])
  useLayoutEffect(measure, [measure, selection])
  useViewportChanges(measure)

  useEffect(() => {
    if (!onEmptyLine) setMenuOpen(false)
  }, [onEmptyLine])

  const runCommand = useCallback(
    (id: InsertCommandId) => {
      setMenuOpen(false)
      editor.send({type: 'focus'})
      for (const event of commandEvents(id)) editor.send(event)
    },
    [editor],
  )

  if (!picker.snapshot.matches('idle')) {
    const caret = editor.dom.getSelectionRect(editor.getSnapshot())
    if (!caret) return null
    const {matches, selectedIndex} = picker.snapshot.context
    return (
      <Floating anchor={caret} placement="below" align="start" scheme={scheme}>
        <Menu
          commands={matches}
          activeIndex={selectedIndex}
          onHover={(index) => picker.send({type: 'navigate to', index})}
          onChoose={() => picker.send({type: 'select'})}
          empty={picker.snapshot.matches({active: 'no matches'})}
        />
      </Floating>
    )
  }

  if (!lineRect || !(showPlus || menuOpen)) return null

  return (
    <>
      <PlusButton
        type="button"
        aria-label="Insert"
        aria-expanded={menuOpen}
        style={{top: lineRect.top + lineRect.height / 2, left: lineRect.left}}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          setActiveIndex(0)
          setMenuOpen((open) => !open)
        }}
      >
        <AddIcon aria-hidden />
      </PlusButton>
      {menuOpen && (
        <Floating
          anchor={lineRect}
          placement="below"
          align="start"
          scheme={scheme}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              setMenuOpen(false)
              editor.send({type: 'focus'})
            }
          }}
        >
          <Menu
            commands={commands}
            activeIndex={activeIndex}
            onHover={setActiveIndex}
            onChoose={(index) => runCommand(commands[index ?? activeIndex]!.id)}
            keyboard={{
              next: () => setActiveIndex((i) => (i + 1) % commands.length),
              previous: () =>
                setActiveIndex((i) => (i - 1 + commands.length) % commands.length),
            }}
          />
        </Floating>
      )}
    </>
  )
}

function Menu({
  commands,
  activeIndex,
  onHover,
  onChoose,
  keyboard,
  empty = false,
}: {
  commands: ReadonlyArray<InsertCommand>
  activeIndex: number
  onHover: (index: number) => void
  onChoose: (index?: number) => void
  keyboard?: {next: () => void; previous: () => void}
  empty?: boolean
}) {
  const activeId = commands[activeIndex]?.id

  // Focus stays on the list (aria-activedescendant), so keep the active option in view ourselves
  // when the menu is scrolled in a short window.
  useLayoutEffect(() => {
    if (activeId) document.getElementById(`calm-insert-${activeId}`)?.scrollIntoView({block: 'nearest'})
  }, [activeId])

  return (
    <FloatingSurface>
      {empty ? (
        <NoMatches>Nothing matches that</NoMatches>
      ) : (
        <List
          role="listbox"
          aria-label="Insert"
          aria-activedescendant={`calm-insert-${activeId}`}
          tabIndex={keyboard ? 0 : -1}
           
          autoFocus={!!keyboard}
          onKeyDown={(event) => {
            if (!keyboard) return
            if (event.key === 'ArrowDown') keyboard.next()
            else if (event.key === 'ArrowUp') keyboard.previous()
            else if (event.key === 'Enter') onChoose()
            else return
            event.preventDefault()
          }}
        >
          {commands.map((command, index) => (
            <Option
              key={command.id}
              id={`calm-insert-${command.id}`}
              role="option"
              aria-selected={index === activeIndex}
              $active={index === activeIndex}
              onMouseEnter={() => onHover(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onChoose(index)}
            >
              <command.icon aria-hidden />
              {command.label}
            </Option>
          ))}
        </List>
      )}
    </FloatingSurface>
  )
}

const PlusButton = styled.button`
  position: fixed;
  z-index: 10;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  margin-left: calc(-1.75rem - var(--calm-space-md));
  border: 0;
  border-radius: var(--calm-radius-pill);
  background: transparent;
  color: var(--calm-color-ink-faint);
  cursor: pointer;
  transform: translateY(-50%);
  transition:
    color var(--calm-motion-gentle) var(--calm-motion-easing),
    background-color var(--calm-motion-gentle) var(--calm-motion-easing);

  &:hover,
  &:focus-visible,
  &[aria-expanded='true'] {
    background: var(--calm-color-surface);
    color: var(--calm-color-ink);
  }

  &:focus-visible {
    outline: 2px solid var(--calm-color-accent);
    outline-offset: 2px;
  }

  svg {
    font-size: 1.25rem;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`

const List = styled.ul`
  display: grid;
  min-width: 13rem;
  margin: 0;
  padding: 0;
  list-style: none;
  outline: none;
`

const Option = styled.li<{$active: boolean}>`
  display: flex;
  align-items: center;
  gap: var(--calm-space-sm);
  padding: var(--calm-space-sm) var(--calm-space-md) var(--calm-space-sm) var(--calm-space-sm);
  border-radius: var(--calm-radius);
  background: ${({$active}) => ($active ? 'var(--calm-color-paper)' : 'transparent')};
  color: var(--calm-color-ink);
  cursor: pointer;

  svg {
    flex-shrink: 0;
    color: var(--calm-color-ink-muted);
    font-size: 1.25rem;
  }
`

const NoMatches = styled.p`
  margin: 0;
  padding: var(--calm-space-sm) var(--calm-space-md);
  color: var(--calm-color-ink-muted);
`
