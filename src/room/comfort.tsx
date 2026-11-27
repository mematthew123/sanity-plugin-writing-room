import {useEditor, useEditorSelector} from '@portabletext/editor'
import {type ReactNode, useEffect, useMemo, useRef, useState, useSyncExternalStore} from 'react'
import {useColorSchemeSetValue, useColorSchemeValue} from 'sanity'
import {Floating, FloatingSurface} from './editor/floating'
import {PillButton, QuietButton, Switch} from './primitives'
import {type RoomSettings, useRoomSettings} from './room-settings'
import {readingTime, wordCount} from './word-count'
import styles from './comfort.module.css'

export function WordCount() {
  const editor = useEditor()
  const body = useEditorSelector(editor, (snapshot) => snapshot.context.value)
  const words = useMemo(() => wordCount(body), [body])
  const time = readingTime(words)
  if (!time) return null
  return (
    <span className={styles.quiet}>
      {words.toLocaleString()} {words === 1 ? 'word' : 'words'} · {time}
    </span>
  )
}

const TEXT_SIZES: Array<{value: RoomSettings['textSize']; label: string}> = [
  {value: 'small', label: 'S'},
  {value: 'medium', label: 'M'},
  {value: 'large', label: 'L'},
]

/** `more` holds Room Controls that don't fit the bar on a narrow screen. */
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
        <span className={styles.glyph} aria-hidden>Aa</span>
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
          <FloatingSurface className={styles.panel} ref={panel} role="dialog" aria-label="Room settings">
            <div className={styles.panelCount}>
              <WordCount />
            </div>
            <div className={styles.setting}>
              <span id="calm-text-size">Text size</span>
              <div className={styles.segments} role="radiogroup" aria-labelledby="calm-text-size">
                {TEXT_SIZES.map((size) => (
                  <PillButton
                    className={styles.segment}
                    key={size.value}
                    role="radio"
                    aria-checked={settings.textSize === size.value}
                    aria-label={size.value}
                    onClick={() => update({textSize: size.value})}
                  >
                    {size.label}
                  </PillButton>
                ))}
              </div>
            </div>
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
            {more && <div className={styles.more}>{more}</div>}
          </FloatingSurface>
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
    <label className={styles.setting}>
      <span>
        {label}
        <span className={styles.hint}>{hint}</span>
      </span>
      <Switch
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
    </label>
  )
}

function subscribeFullscreen(onChange: () => void) {
  document.addEventListener('fullscreenchange', onChange)
  return () => document.removeEventListener('fullscreenchange', onChange)
}

const FULLSCREEN_KEYS =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘⇧F' : 'Ctrl+Shift+F'

/** Opt-in only. The browser takes the first Esc to leave fullscreen. */
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
    // Some browsers refuse fullscreen, e.g. inside an iframe.
  }
}
