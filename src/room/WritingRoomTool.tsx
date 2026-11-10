import {toCss} from '@calm/tokens'
import {Suspense} from 'react'
import {type Tool, useColorSchemeValue} from 'sanity'
import {useRouter} from 'sanity/router'
import {type WritingRoomConfig, WritingRoomConfigProvider} from '../config'
import {Lobby} from './Lobby'
import {Surface} from './primitives'
import {Room} from './Room'
import {SetupProblemBoundary} from './SetupProblem'
import {openedDocument} from './room-route'

/**
 * The room's design tokens as CSS custom properties. Rendered as a `<style>` (React hoists and
 * dedupes it by `href`) rather than imported as a stylesheet, so the plugin works in any Studio
 * without a CSS loader.
 */
const TOKENS_CSS = toCss()

export function WritingRoomTool({tool}: {tool: Tool<WritingRoomConfig>}) {
  const {state} = useRouter()
  const scheme = useColorSchemeValue()
  const config = tool.options!
  const opened = openedDocument(
    state,
    config.types.map((option) => option.type),
  )

  return (
    <WritingRoomConfigProvider config={config}>
      <style href="sanity-plugin-writing-room/tokens" precedence="default">
        {TOKENS_CSS}
      </style>
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
