import {toScopedCss} from '@calm/tokens'
import {Suspense, useEffect, useMemo, useState} from 'react'
import {type Tool, useColorSchemeValue} from 'sanity'
import {useRouter} from 'sanity/router'
import {type WritingRoomConfig, WritingRoomConfigProvider} from '../config'
import {Lobby} from './Lobby'
import {Surface} from './primitives'
import {Room} from './Room'
import {SetupProblemBoundary} from './SetupProblem'
import {openedDocument} from './room-route'

/** The room's own elements: its surface, and its popovers (portaled to the body). */
const ROOM_ELEMENTS = ['[data-calm-surface]', '[data-calm-floating]']

/**
 * The room's fonts, loaded the first time the room opens (they're ~230 KB, in their own chunk) and
 * kept for the rest of the session. Until then, and if they fail, the token stacks' fallbacks show.
 */
let fontsCss: Promise<string> | undefined
function useRoomFonts(): string | null {
  const [css, setCss] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    fontsCss ??= import('./fonts').then((module) => module.FONT_FACES_CSS)
    fontsCss.then(
      (loaded) => active && setCss(loaded),
      () => undefined,
    )
    return () => {
      active = false
    }
  }, [])
  return css
}

export function WritingRoomTool({tool}: {tool: Tool<WritingRoomConfig>}) {
  const fonts = useRoomFonts()
  const {state} = useRouter()
  const scheme = useColorSchemeValue()
  const config = tool.options!
  // The design tokens as CSS custom properties, set only on the room's own elements, so they
  // never touch the rest of the Studio. A `<style>` (React hoists and dedupes it by `href`) rather
  // than an imported stylesheet, so the plugin works in any Studio without a CSS loader.
  const tokensCss = useMemo(() => toScopedCss(ROOM_ELEMENTS, config.colors), [config.colors])
  const opened = openedDocument(
    state,
    config.types.map((option) => option.type),
  )

  return (
    <WritingRoomConfigProvider config={config}>
      <style href="sanity-plugin-writing-room/tokens" precedence="default">
        {tokensCss}
      </style>
      {fonts && (
        <style href="sanity-plugin-writing-room/fonts" precedence="default">
          {fonts}
        </style>
      )}
      <Surface data-scheme={scheme} data-calm-surface="">
        <SetupProblemBoundary>
          <Suspense fallback={null}>
            {opened ? (
              <Room key={opened.documentId} documentId={opened.documentId} documentType={opened.documentType} />
            ) : (
              <Lobby />
            )}
          </Suspense>
        </SetupProblemBoundary>
      </Surface>
    </WritingRoomConfigProvider>
  )
}
