import {useEditor, useEditorSelector} from '@portabletext/editor'
import {type ReactNode, useEffect, useMemo, useRef, useState, useSyncExternalStore} from 'react'
import {useColorSchemeSetValue, useColorSchemeValue} from 'sanity'
import styled from 'styled-components'
import {Floating, FloatingSurface} from './editor/floating'
import {NARROW, NO_MARGIN, QuietButton} from './primitives'
import {type RoomSettings, useRoomSettings} from './room-settings'
import {readingTime, wordCount} from './word-count'

/** "1,240 words · 6 min read", quietly, out of the way of the Room Controls. */
export function WordCount() {
  const editor = useEditor()
  const body = useEditorSelector(editor, (snapshot) => snapshot.context.value)
  const words = useMemo(() => wordCount(body), [body])
  const time = readingTime(words)
  if (!time) return null
  return (
    <Quiet>
      {words.toLocaleString()} {words === 1 ? 'word' : 'words'} · {time}
    </Quiet>
  )
}

const TEXT_SIZES: Array<{value: RoomSettings['textSize']; label: string}> = [
  {value: 'small', label: 'S'},
  {value: 'medium', label: 'M'},
  {value: 'large', label: 'L'},
]

/**
 * The `Aa` menu, where everything about how the room looks lives: text size, typewriter scrolling
 * and focus dimming (remembered per browser), dark mode and fullscreen. `more` is for Room
 * Controls that don't fit in the bar on a narrow screen; they're listed here instead.
 */
export function RoomSettingsMenu({scheme, more}: {scheme: string; more?: ReactNode}) {
  const [settings, update] = useRoomSettings()
  const setScheme = useColorSchemeSetValue()
  const isDark = useColorSchemeValue() === 'dark'
  const isFullscreen = useFullscreen()
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!anchor) return undefined
    const close = (event: PointerEvent) => {
      const target = event.target as Node
      if (!panel.current?.contains(target) && !button.current?.contains(target)) setAnchor(null)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [anchor])

  return (
    <>
      <QuietButton
        ref={button}
        aria-label="Room settings"
        title="Room settings"
        aria-expanded={!!anchor}
        onClick={(event) =>
          setAnchor(anchor ? null : event.currentTarget.getBoundingClientRect())
        }
      >
        <Glyph aria-hidden>Aa</Glyph>
      </QuietButton>
      {anchor && (
        <Floating
          anchor={anchor}
          placement="below"
          align="start"
          scheme={scheme}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              setAnchor(null)
              button.current?.focus()
            }
          }}
        >
          <Panel ref={panel} role="dialog" aria-label="Room settings">
            <PanelCount>
              <WordCount />
            </PanelCount>
            <Setting>
              <span id="calm-text-size">Text size</span>
              <Segments role="radiogroup" aria-labelledby="calm-text-size">
                {TEXT_SIZES.map((size) => (
                  <Segment
                    key={size.value}
                    type="button"
                    role="radio"
                    aria-checked={settings.textSize === size.value}
                    aria-label={size.value}
                    $active={settings.textSize === size.value}
                    onClick={() => update({textSize: size.value})}
                  >
                    {size.label}
                  </Segment>
                ))}
              </Segments>
            </Setting>
            <Toggle
              label="Typewriter scrolling"
              hint="Keeps the line you’re writing at the same height"
              checked={settings.typewriter}
              onChange={(typewriter) => update({typewriter})}
            />
            <Toggle
              label="Focus dimming"
              hint="Softens everything but the paragraph you’re in"
              checked={settings.focusDimming}
              onChange={(focusDimming) => update({focusDimming})}
            />
            {setScheme && (
              <Toggle
                label="Dark mode"
                hint="For the whole Studio"
                checked={isDark}
                onChange={(dark) => setScheme(dark ? 'dark' : 'light')}
              />
            )}
            {document.fullscreenEnabled && (
              <Toggle
                label="Fullscreen"
                hint={`Hides the browser too · ${FULLSCREEN_KEYS}`}
                checked={isFullscreen}
                onChange={() => void toggleFullscreen()}
              />
            )}
            {more && <More>{more}</More>}
          </Panel>
        </Floating>
      )}
    </>
  )
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <Setting as="label">
      <span>
        {label}
        <Hint>{hint}</Hint>
      </span>
      <Switch
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
    </Setting>
  )
}

function subscribeFullscreen(onChange: () => void) {
  document.addEventListener('fullscreenchange', onChange)
  return () => document.removeEventListener('fullscreenchange', onChange)
}

const FULLSCREEN_KEYS =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘⇧F' : 'Ctrl+Shift+F'

/**
 * Whether the room is in true fullscreen (the browser's own tabs hidden too). Opt-in only: the
 * `Aa` menu, or ⌘/Ctrl + Shift + F from anywhere in the room. The browser takes the first Esc to
 * leave fullscreen.
 */
function useFullscreen(): boolean {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        void toggleFullscreen()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return useSyncExternalStore(subscribeFullscreen, () => !!document.fullscreenElement)
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await document.documentElement.requestFullscreen()
  } catch {
    // Some browsers refuse fullscreen (e.g. inside an iframe); the room works without it.
  }
}

const Quiet = styled.span`
  color: var(--calm-color-ink-muted);
  font-size: var(--calm-type-ui-size-small);
  white-space: nowrap;
`

const Glyph = styled.span`
  font-family: var(--calm-font-prose);
  font-size: 1rem;
`

const Panel = styled(FloatingSurface)`
  display: grid;
  gap: var(--calm-space-xs);
  width: 18rem;
  padding: var(--calm-space-sm);
`

const Setting = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--calm-space-md);
  padding: var(--calm-space-sm);
  border-radius: var(--calm-radius);
  cursor: default;

  label& {
    cursor: pointer;
  }
`

const Hint = styled.span`
  display: block;
  margin-top: 2px;
  color: var(--calm-color-ink-muted);
  font-size: var(--calm-type-ui-size-small);
`

const Segments = styled.div`
  display: flex;
  padding: 2px;
  border-radius: var(--calm-radius-pill);
  background: var(--calm-color-paper);
`

const Segment = styled.button<{$active: boolean}>`
  min-width: 2rem;
  height: 1.75rem;
  border: 0;
  border-radius: var(--calm-radius-pill);
  background: ${({$active}) => ($active ? 'var(--calm-color-surface)' : 'transparent')};
  color: ${({$active}) => ($active ? 'var(--calm-color-ink)' : 'var(--calm-color-ink-muted)')};
  font: inherit;
  font-weight: ${({$active}) => ($active ? 'var(--calm-weight-ui-strong)' : 'inherit')};
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid var(--calm-color-accent);
    outline-offset: 1px;
  }
`

const Switch = styled.input`
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

/** The word count, here only when there's no margin for it at the foot of the room. */
const PanelCount = styled.div`
  display: none;

  ${NO_MARGIN} {
    display: block;
    padding: var(--calm-space-xs) var(--calm-space-sm);

    &:empty {
      display: none;
    }
  }
`

/** Room Controls that moved out of the bar on a narrow screen. */
const More = styled.div`
  display: none;

  ${NARROW} {
    display: grid;
    margin-top: var(--calm-space-xs);
    padding-top: var(--calm-space-xs);
    border-top: 1px solid var(--calm-color-rule);

    button {
      justify-content: flex-start;
      width: 100%;
      padding-inline: var(--calm-space-sm);
      border-radius: var(--calm-radius);
      color: var(--calm-color-ink);
    }

    button:hover,
    button:focus-visible {
      background: var(--calm-color-paper);
    }
  }
`
