import {defineBehavior, effect, raise} from '@portabletext/editor/behaviors'
import {getFocusTextBlock, isSelectionCollapsed} from '@portabletext/editor/selectors'
import {isEmptyTextBlock} from '@portabletext/editor/utils'
import {defineInputRule} from '@portabletext/plugin-input-rule'
import {parseEmbedUrl} from '../../embed'
import {bodyAllows} from './allows'
import {CHOOSE_IMAGE_EVENT, PICK_IMAGE_EVENT} from './commands'

export const exitStyleOnEmptyEnter = defineBehavior({
  on: 'insert.break',
  guard: ({snapshot}) => {
    const focus = getFocusTextBlock(snapshot)
    if (!focus || !focus.node.style || focus.node.style === 'normal') return false
    return isEmptyTextBlock(snapshot.context, focus.node) ? {path: focus.path} : false
  },
  actions: [(_, {path}) => [raise({type: 'block.set', at: path, props: {style: 'normal'}})]],
})

export const pasteLinkAsEmbed = defineBehavior({
  on: 'clipboard.paste',
  guard: ({snapshot, event}) => {
    const embedType = bodyAllows(snapshot.context.schema).roomBlock('embed')
    if (!embedType) return false
    const text = event.originEvent.dataTransfer.getData('text/plain').trim()
    if (!text || !parseEmbedUrl(text) || !isSelectionCollapsed(snapshot)) return false
    const focus = getFocusTextBlock(snapshot)
    if (!focus || focus.node.listItem || !isEmptyTextBlock(snapshot.context, focus.node)) return false
    return {url: text, embedType}
  },
  actions: [
    (_, {url, embedType}) => [
      raise({type: 'insert.block', block: {_type: embedType, url}, placement: 'auto', select: 'end'}),
    ],
  ],
})

function imageFiles(dataTransfer: DataTransfer): File[] {
  return Array.from(dataTransfer.files).filter((file) => file.type.startsWith('image/'))
}

export function imageFileBehaviors(upload: (files: File[]) => void) {
  return [
    defineBehavior({
      on: 'clipboard.paste',
      guard: ({snapshot, event}) => {
        if (!bodyAllows(snapshot.context.schema).block('image')) return false
        const files = imageFiles(event.originEvent.dataTransfer)
        return files.length > 0 ? {files} : false
      },
      actions: [(_, {files}) => [effect(() => upload(files))]],
    }),
    defineBehavior({
      on: 'drag.drop',
      guard: ({snapshot, event}) => {
        if (!bodyAllows(snapshot.context.schema).block('image')) return false
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

export function pickImageBehavior(pickImage: () => void) {
  return defineBehavior({
    on: PICK_IMAGE_EVENT,
    actions: [() => [effect(pickImage)]],
  })
}

export function chooseImageBehavior(chooseImage: () => void) {
  return defineBehavior({
    on: CHOOSE_IMAGE_EVENT,
    actions: [() => [effect(chooseImage)]],
  })
}

export const codeFenceRule = defineInputRule({
  on: /^```$/,
  guard: ({snapshot, event}) => {
    const codeType = bodyAllows(snapshot.context.schema).roomBlock('codeBlock')
    if (!codeType) return false
    const match = event.matches.at(0)
    return match ? {match, codeType} : false
  },
  actions: [
    (_, {match, codeType}) => [
      raise({type: 'delete', at: match.targetOffsets}),
      raise({
        type: 'insert.block',
        block: {_type: codeType, language: 'text'},
        placement: 'auto',
        select: 'start',
      }),
    ],
  ],
})
