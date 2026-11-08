import {useEditor, useEditorSelector} from '@portabletext/editor'
import {CollapseIcon} from '@sanity/icons/Collapse'
import {ExpandIcon} from '@sanity/icons/Expand'
import {useEffect, useMemo, useRef, useState, useSyncExternalStore} from 'react'
import styled from 'styled-components'
import {Floating, FloatingSurface} from './editor/floating'
import {QuietButton} from './primitives'
import {type RoomSettings, useRoomSettings} from './room-settings'
import {readingTime, wordCount} from './word-count'

/** "1,240 words · 6 min read", quietly, in the Room Controls. */
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

/** The `Aa` menu: text size, typewriter scrolling and focus dimming, remembered per browser. */
export function RoomSettingsMenu({scheme}: {scheme: string}) {
  const [settings, update] = useRoomSettings()
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

/**
 * Optional true fullscreen (hides the browser's own tabs too). Opt-in only: a click or
 * ⌘/Ctrl + Shift + F. The browser takes the first Esc to leave fullscreen.
 */
export function FullscreenToggle() {
  const isFullscreen = useSyncExternalStore(subscribeFullscreen, () => !!document.fullscreenElement)

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

  if (!document.fullscreenEnabled) return null
  const label = isFullscreen ? 'Exit fullscreen' : 'Fullscreen (⌘⇧F)'
  return (
    <QuietButton
      icon={isFullscreen ? CollapseIcon : ExpandIcon}
      aria-label={label}
      title={label}
      onClick={() => void toggleFullscreen()}
    />
  )
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
  width: 17rem;
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
  flex-shrink: 0;
  width: 1.1rem;
  height: 1.1rem;
  margin: 0;
  accent-color: var(--calm-color-accent);
  cursor: pointer;
`
