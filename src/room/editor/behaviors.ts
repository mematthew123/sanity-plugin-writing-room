import {defineBehavior, effect, raise} from '@portabletext/editor/behaviors'
import {getFocusTextBlock, isSelectionCollapsed} from '@portabletext/editor/selectors'
import {isEmptyTextBlock} from '@portabletext/editor/utils'
import {defineInputRule} from '@portabletext/plugin-input-rule'
import {parseEmbedUrl} from '@calm/content'
import {PICK_IMAGE_EVENT} from './commands'

/** Enter on an empty heading or quote returns to a plain paragraph rather than repeating the style. */
export const exitStyleOnEmptyEnter = defineBehavior({
  on: 'insert.break',
  guard: ({snapshot}) => {
    const focus = getFocusTextBlock(snapshot)
    if (!focus || !focus.node.style || focus.node.style === 'normal') return false
    return isEmptyTextBlock(snapshot.context, focus.node) ? {path: focus.path} : false
  },
  actions: [(_, {path}) => [raise({type: 'block.set', at: path, props: {style: 'normal'}})]],
})

/** Pasting a YouTube, Vimeo or Spotify link onto an empty line makes it an Embed. */
export const pasteLinkAsEmbed = defineBehavior({
  on: 'clipboard.paste',
  guard: ({snapshot, event}) => {
    const text = event.originEvent.dataTransfer.getData('text/plain').trim()
    if (!text || !parseEmbedUrl(text) || !isSelectionCollapsed(snapshot)) return false
    const focus = getFocusTextBlock(snapshot)
    if (!focus || focus.node.listItem || !isEmptyTextBlock(snapshot.context, focus.node)) return false
    return {url: text}
  },
  actions: [
    (_, {url}) => [
      raise({type: 'insert.block', block: {_type: 'embed', url}, placement: 'auto', select: 'end'}),
    ],
  ],
})

function imageFiles(dataTransfer: DataTransfer): File[] {
  return Array.from(dataTransfer.files).filter((file) => file.type.startsWith('image/'))
}

/** Pasted or dropped image files are uploaded and placed in the body. */
export function imageFileBehaviors(upload: (files: File[]) => void) {
  return [
    defineBehavior({
      on: 'clipboard.paste',
      guard: ({event}) => {
        const files = imageFiles(event.originEvent.dataTransfer)
        return files.length > 0 ? {files} : false
      },
      actions: [(_, {files}) => [effect(() => upload(files))]],
    }),
    defineBehavior({
      on: 'drag.drop',
      guard: ({event}) => {
        const files = imageFiles(event.originEvent.dataTransfer)
        return files.length > 0 ? {files} : false
      },
      actions: [
        ({event}) => [raise({type: 'select', at: event.position.selection})],
        (_, {files}) => [effect(() => upload(files))],
      ],
    }),
  ]
}

/** The Insert Menu's Image command asks the room to open a file picker. */
export function pickImageBehavior(pickImage: () => void) {
  return defineBehavior({
    on: PICK_IMAGE_EVENT,
    actions: [() => [effect(pickImage)]],
  })
}

/** Typing three backticks on an empty line starts a Code Block. */
export const codeFenceRule = defineInputRule({
  on: /^```$/,
  guard: ({event}) => {
    const match = event.matches.at(0)
    return match ? {match} : false
  },
  actions: [
    (_, {match}) => [
      raise({type: 'delete', at: match.targetOffsets}),
      raise({
        type: 'insert.block',
        block: {_type: 'codeBlock', language: 'text'},
        placement: 'auto',
        select: 'start',
      }),
    ],
  ],
})
