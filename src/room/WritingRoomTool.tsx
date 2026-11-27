import {css as roomCss, key as roomCssKey} from 'virtual:room-styles'
import {cspNonce} from '../lib/csp-nonce'
import {toScopedCss} from '../tokens'
import {Suspense, useEffect, useMemo, useState} from 'react'
import {type Tool, useColorSchemeValue} from 'sanity'
import {useRouter} from 'sanity/router'
import {type WritingRoomConfig, WritingRoomConfigProvider} from '../config'
import {Lobby} from './Lobby'
import {Surface} from './primitives'
import {Room} from './Room'
import {SetupProblemBoundary} from './SetupProblem'
import {openedDocument} from './room-route'

/** The surface and its portaled popovers. */
const ROOM_ELEMENTS = ['[data-calm-surface]', '[data-calm-floating]']

/** Loaded lazily and kept for the session; the token stacks' fallbacks show until then. */
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
  // Scoped to the room's elements so the rest of the Studio is untouched. Each is a `<style>` rather
  // than an imported stylesheet, so the plugin needs no CSS loader, and is only on the page once the
  // room has been opened.
  const tokensCss = useMemo(() => toScopedCss(ROOM_ELEMENTS, config.colors), [config.colors])
  const nonce = useMemo(cspNonce, [])
  const opened = openedDocument(
    state,
    config.types.map((option) => option.type),
  )

  return (
    <WritingRoomConfigProvider config={config}>
      <style href="sanity-plugin-writing-room/tokens" precedence="default" nonce={nonce}>
        {tokensCss}
      </style>
      {/* The CSS Modules' rules. Keyed by their content, so two versions of the plugin each keep their own. */}
      <style href={`sanity-plugin-writing-room/styles-${roomCssKey}`} precedence="default" nonce={nonce}>
        {roomCss}
      </style>
      {fonts && (
        <style href="sanity-plugin-writing-room/fonts" precedence="default" nonce={nonce}>
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
