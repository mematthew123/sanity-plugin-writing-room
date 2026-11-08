import {toCss} from '@calm/tokens'
import {Suspense} from 'react'
import {type Tool, useColorSchemeValue} from 'sanity'
import {useRouter} from 'sanity/router'
import {type WritingRoomConfig, WritingRoomConfigProvider} from '../config'
import {Lobby} from './Lobby'
import {Surface} from './primitives'
import {Room} from './Room'

/**
 * The room's design tokens as CSS custom properties. Rendered as a `<style>` (React hoists and
 * dedupes it by `href`) rather than imported as a stylesheet, so the plugin works in any Studio
 * without a CSS loader.
 */
const TOKENS_CSS = toCss()

export function WritingRoomTool({tool}: {tool: Tool<WritingRoomConfig>}) {
  const {state} = useRouter()
  const scheme = useColorSchemeValue()
  const postId = typeof state.postId === 'string' ? state.postId : undefined

  return (
    <WritingRoomConfigProvider config={tool.options!}>
      <style href="sanity-plugin-writing-room/tokens" precedence="default">
        {TOKENS_CSS}
      </style>
      <Surface data-scheme={scheme} data-calm-surface="">
        <Suspense fallback={null}>
          {postId ? <Room key={postId} postId={postId} /> : <Lobby />}
        </Suspense>
      </Surface>
    </WritingRoomConfigProvider>
  )
}
