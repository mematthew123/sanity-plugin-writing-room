import {useEditor, useEditorSelector} from '@portabletext/editor'
import {raise} from '@portabletext/editor/behaviors'
import {getFocusTextBlock, isSelectionCollapsed} from '@portabletext/editor/selectors'
import {getTextBlockText, isEmptyTextBlock} from '@portabletext/editor/utils'
import {defineTypeaheadPicker, useTypeaheadPicker} from '@portabletext/plugin-typeahead-picker'
import {AddIcon} from '@sanity/icons/Add'
import {ImageIcon} from '@sanity/icons/Image'
import {
  type ComponentType,
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {type AssetSource, useTranslation} from 'sanity'
import {type BodyAllows, useBodyAllows} from './allows'
import {commandEvents, type InsertCommand, type InsertCommandId, matchCommands} from './commands'
import {Floating, FloatingSurface, useViewportChanges} from './floating'
import {type BodyImages} from './image-sources'
import styles from './InsertMenu.module.css'

/** Built per body type, since the picker's matcher only sees what was typed. */
const slashPicker = (allows: BodyAllows, images: BodyImages) =>
  defineTypeaheadPicker<InsertCommand & {key: string}>({
    trigger: /^\//,
    keyword: /\w*/,
    guard: ({snapshot}) => {
      const focus = getFocusTextBlock(snapshot)
      return !!focus && !focus.node.listItem && getTextBlockText(focus.node) === '/'
    },
    getMatches: ({keyword}) => matchCommands(keyword, allows, images).map((command) => ({...command, key: command.id})),
    onSelect: [
      ({event}) => [
        raise({type: 'delete', at: event.patternSelection}),
        ...commandEvents(event.match.id, allows).map((commandEvent) => raise(commandEvent)),
      ],
    ],
  })

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

interface MenuItem {
  id: string
  label: string
  icon: ComponentType
}

export function InsertMenu({
  scheme,
  editorFocused,
  images,
  choosingSource,
  onChooseSource,
}: {
  scheme: string
  editorFocused: boolean
  images: BodyImages
  /** The Writer asked to choose an image and there are several image sources to choose it from. */
  choosingSource: boolean
  /** `null` when the Writer backs out. */
  onChooseSource: (source: AssetSource | null) => void
}) {
  const editor = useEditor()
  const onEmptyLine = useOnEmptyLine()
  const selection = useEditorSelector(editor, (snapshot) => snapshot.context.selection)
  const allows = useBodyAllows()
  const commands = useMemo(() => matchCommands('', allows, images), [allows, images])
  const picker = useTypeaheadPicker(useMemo(() => slashPicker(allows, images), [allows, images]))
  // Each source by the name it gives itself in the Studio's own Select menu.
  const {t} = useTranslation()
  const sources = useMemo(
    () =>
      images.sources.map((source, index): MenuItem => ({
        id: `source-${index}`,
        label: (source.i18nKey && t(source.i18nKey)) || source.title || source.name,
        icon: source.icon ?? ImageIcon,
      })),
    [images.sources, t],
  )
  const [lineRect, setLineRect] = useState<DOMRect | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  const showPlus = editorFocused && onEmptyLine && commands.length > 0 && picker.snapshot.matches('idle')

  const measure = useCallback(() => {
    const block =
      showPlus || menuOpen || choosingSource ? editor.dom.getStartBlockElement(editor.getSnapshot()) : null
    setLineRect(block ? block.getBoundingClientRect() : null)
  }, [editor, showPlus, menuOpen, choosingSource])
  useLayoutEffect(measure, [measure, selection])
  useViewportChanges(measure)

  useEffect(() => {
    if (!onEmptyLine) setMenuOpen(false)
  }, [onEmptyLine])

  useEffect(() => {
    if (choosingSource) setActiveIndex(0)
  }, [choosingSource])

  const runCommand = useCallback(
    (id: InsertCommandId) => {
      setMenuOpen(false)
      editor.send({type: 'focus'})
      for (const event of commandEvents(id, allows)) editor.send(event)
    },
    [editor, allows],
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

  // The same panel, in the same place, now listing where an image can be chosen from.
  if (choosingSource) {
    if (!lineRect) return null
    return (
      <Floating
        anchor={lineRect}
        placement="below"
        align="start"
        scheme={scheme}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            onChooseSource(null)
            editor.send({type: 'focus'})
          }
        }}
      >
        <Menu
          label="Choose an image from"
          commands={sources}
          activeIndex={activeIndex}
          onHover={setActiveIndex}
          onChoose={(index) => onChooseSource(images.sources[index ?? activeIndex] ?? null)}
          onLeave={() => onChooseSource(null)}
          keyboard={{
            next: () => setActiveIndex((i) => (i + 1) % sources.length),
            previous: () => setActiveIndex((i) => (i - 1 + sources.length) % sources.length),
          }}
        />
      </Floating>
    )
  }

  if (!lineRect || !(showPlus || menuOpen)) return null

  return (
    <>
      <button
        className={styles.plusButton}
        type="button"
        aria-label="Insert"
        aria-expanded={menuOpen}
        style={
          {
            top: lineRect.top + lineRect.height / 2,
            '--calm-line-start': `${lineRect.left}px`,
            '--calm-line-end': `${lineRect.right}px`,
          } as CSSProperties
        }
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          setActiveIndex(0)
          setMenuOpen((open) => !open)
        }}
      >
        <AddIcon aria-hidden />
      </button>
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
  label = 'Insert',
  commands,
  activeIndex,
  onHover,
  onChoose,
  onLeave,
  keyboard,
  empty = false,
}: {
  label?: string
  commands: ReadonlyArray<MenuItem>
  activeIndex: number
  onHover: (index: number) => void
  onChoose: (index?: number) => void
  /** Focus went somewhere else. */
  onLeave?: () => void
  keyboard?: {next: () => void; previous: () => void}
  empty?: boolean
}) {
  const activeId = commands[activeIndex]?.id
  const list = useRef<HTMLUListElement>(null)
  const takesFocus = !!keyboard

  // `autoFocus` alone is the browser's to honour, and it only does so once per page.
  // A frame later, because the panel is hidden until it has found its place, and nothing hidden takes focus.
  useEffect(() => {
    if (!takesFocus) return undefined
    const frame = requestAnimationFrame(() => list.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [takesFocus])

  // Focus stays on the list (aria-activedescendant), so the browser won't scroll the active option into view.
  useLayoutEffect(() => {
    if (activeId) document.getElementById(`calm-insert-${activeId}`)?.scrollIntoView({block: 'nearest'})
  }, [activeId])

  return (
    <FloatingSurface>
      {empty ? (
        <p className={styles.noMatches}>Nothing matches that</p>
      ) : (
        <ul
          className={styles.list}
          ref={list}
          role="listbox"
          aria-label={label}
          onBlur={onLeave}
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
            <li
              className={styles.option}
              key={command.id}
              id={`calm-insert-${command.id}`}
              role="option"
              aria-selected={index === activeIndex}
              onMouseEnter={() => onHover(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onChoose(index)}
            >
              <command.icon aria-hidden />
              {command.label}
            </li>
          ))}
        </ul>
      )}
    </FloatingSurface>
  )
}
