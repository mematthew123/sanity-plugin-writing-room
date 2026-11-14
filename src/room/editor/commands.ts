import {type ComponentType} from 'react'
import {AsteriskIcon} from '@sanity/icons/Asterisk'
import {BlockquoteIcon} from '@sanity/icons/Blockquote'
import {CodeBlockIcon} from '@sanity/icons/CodeBlock'
import {ImageIcon} from '@sanity/icons/Image'
import {OlistIcon} from '@sanity/icons/Olist'
import {PlayIcon} from '@sanity/icons/Play'
import {UlistIcon} from '@sanity/icons/Ulist'
import {UploadIcon} from '@sanity/icons/Upload'
import {type BodyAllows} from './allows'
import {type BodyImages} from './image-sources'

export type InsertCommandId =
  | 'uploadImage'
  | 'chooseImage'
  | 'embed'
  | 'codeBlock'
  | 'sectionBreak'
  | 'quote'
  | 'bulletList'
  | 'numberList'

export interface InsertCommand {
  id: InsertCommandId
  label: string
  icon: ComponentType
  keywords: string[]
  allowed: (allows: BodyAllows, images: Pick<BodyImages, 'upload' | 'sources'>) => boolean
}

/** In display order. */
export const INSERT_COMMANDS: InsertCommand[] = [
  {
    id: 'uploadImage',
    label: 'Upload an image',
    icon: UploadIcon,
    keywords: ['picture', 'photo'],
    allowed: (a, images) => a.block('image') && images.upload,
  },
  {
    id: 'chooseImage',
    label: 'Choose an image',
    icon: ImageIcon,
    keywords: ['picture', 'photo', 'existing', 'library'],
    allowed: (a, images) => a.block('image') && images.sources.length > 0,
  },
  {
    id: 'embed',
    label: 'Embed',
    icon: PlayIcon,
    keywords: ['video', 'youtube', 'vimeo', 'spotify'],
    allowed: (a) => !!a.roomBlock('embed'),
  },
  {
    id: 'codeBlock',
    label: 'Code block',
    icon: CodeBlockIcon,
    keywords: ['code', 'snippet'],
    allowed: (a) => !!a.roomBlock('codeBlock'),
  },
  {
    id: 'sectionBreak',
    label: 'Section break',
    icon: AsteriskIcon,
    keywords: ['divider', 'break'],
    allowed: (a) => !!a.roomBlock('sectionBreak'),
  },
  {id: 'quote', label: 'Quote', icon: BlockquoteIcon, keywords: ['blockquote'], allowed: (a) => a.style('blockquote')},
  {id: 'bulletList', label: 'Bulleted list', icon: UlistIcon, keywords: ['list', 'bullet'], allowed: (a) => a.list('bullet')},
  {id: 'numberList', label: 'Numbered list', icon: OlistIcon, keywords: ['list', 'ordered'], allowed: (a) => a.list('number')},
]

export function matchCommands(
  keyword: string,
  allows: BodyAllows,
  images: Pick<BodyImages, 'upload' | 'sources'>,
): InsertCommand[] {
  const query = keyword.trim().toLowerCase()
  const available = INSERT_COMMANDS.filter((command) => command.allowed(allows, images))
  if (!query) return available
  return available.filter(
    (command) =>
      command.label.toLowerCase().includes(query) ||
      command.keywords.some((word) => word.startsWith(query)),
  )
}

export const PICK_IMAGE_EVENT = 'custom.pick image'
export const CHOOSE_IMAGE_EVENT = 'custom.choose image'

/** Images need a file or a choice first, so they raise an event of their own instead. */
export function commandEvents(id: InsertCommandId, allows: BodyAllows) {
  switch (id) {
    case 'uploadImage':
      return [{type: PICK_IMAGE_EVENT} as const]
    case 'chooseImage':
      return [{type: CHOOSE_IMAGE_EVENT} as const]
    case 'embed':
      return [
        {type: 'insert.block', block: {_type: allows.roomBlock('embed')!}, placement: 'auto', select: 'start'} as const,
      ]
    case 'codeBlock':
      return [
        {
          type: 'insert.block',
          block: {_type: allows.roomBlock('codeBlock')!, language: 'text'},
          placement: 'auto',
          select: 'start',
        } as const,
      ]
    case 'sectionBreak':
      // Before the empty line, so the Writer carries straight on.
      return [
        {
          type: 'insert.block',
          block: {_type: allows.roomBlock('sectionBreak')!, kind: 'break'},
          placement: 'before',
          select: 'none',
        } as const,
      ]
    case 'quote':
      return [{type: 'style.toggle', style: 'blockquote'} as const]
    case 'bulletList':
      return [{type: 'list item.toggle', listItem: 'bullet'} as const]
    case 'numberList':
      return [{type: 'list item.toggle', listItem: 'number'} as const]
  }
}
