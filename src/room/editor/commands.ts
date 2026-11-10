import {type ComponentType} from 'react'
import {AsteriskIcon} from '@sanity/icons/Asterisk'
import {BlockquoteIcon} from '@sanity/icons/Blockquote'
import {CodeBlockIcon} from '@sanity/icons/CodeBlock'
import {ImageIcon} from '@sanity/icons/Image'
import {OlistIcon} from '@sanity/icons/Olist'
import {PlayIcon} from '@sanity/icons/Play'
import {UlistIcon} from '@sanity/icons/Ulist'
import {type BodyAllows} from './allows'

export type InsertCommandId =
  | 'image'
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
  /** Whether the body type can store what this command adds. */
  allowed: (allows: BodyAllows) => boolean
}

/** Everything the Insert Menu can offer, in the order the Writer sees it. */
export const INSERT_COMMANDS: InsertCommand[] = [
  {id: 'image', label: 'Image', icon: ImageIcon, keywords: ['picture', 'photo'], allowed: (a) => a.block('image')},
  {
    id: 'embed',
    label: 'Embed',
    icon: PlayIcon,
    keywords: ['video', 'youtube', 'vimeo', 'spotify'],
    allowed: (a) => a.block('embed'),
  },
  {
    id: 'codeBlock',
    label: 'Code block',
    icon: CodeBlockIcon,
    keywords: ['code', 'snippet'],
    allowed: (a) => a.block('codeBlock'),
  },
  {
    id: 'sectionBreak',
    label: 'Section break',
    icon: AsteriskIcon,
    keywords: ['divider', 'break'],
    allowed: (a) => a.block('sectionBreak'),
  },
  {id: 'quote', label: 'Quote', icon: BlockquoteIcon, keywords: ['blockquote'], allowed: (a) => a.style('blockquote')},
  {id: 'bulletList', label: 'Bulleted list', icon: UlistIcon, keywords: ['list', 'bullet'], allowed: (a) => a.list('bullet')},
  {id: 'numberList', label: 'Numbered list', icon: OlistIcon, keywords: ['list', 'ordered'], allowed: (a) => a.list('number')},
]

/** The commands this body allows that match what the Writer typed after `/` (all of them for none). */
export function matchCommands(keyword: string, allows: BodyAllows): InsertCommand[] {
  const query = keyword.trim().toLowerCase()
  const available = INSERT_COMMANDS.filter((command) => command.allowed(allows))
  if (!query) return available
  return available.filter(
    (command) =>
      command.label.toLowerCase().includes(query) ||
      command.keywords.some((word) => word.startsWith(query)),
  )
}

/** Custom editor event that asks the room to open the image file picker. */
export const PICK_IMAGE_EVENT = 'custom.pick image'

/**
 * The editor events that carry out a command on the current (empty) line. Images are the
 * exception: they need a file first, so they raise {@link PICK_IMAGE_EVENT} instead.
 */
export function commandEvents(id: InsertCommandId) {
  switch (id) {
    case 'image':
      return [{type: PICK_IMAGE_EVENT} as const]
    case 'embed':
      return [{type: 'insert.block', block: {_type: 'embed'}, placement: 'auto', select: 'start'} as const]
    case 'codeBlock':
      return [
        {
          type: 'insert.block',
          block: {_type: 'codeBlock', language: 'text'},
          placement: 'auto',
          select: 'start',
        } as const,
      ]
    case 'sectionBreak':
      // Placed before the empty line, so the Writer carries straight on after the pause.
      return [
        {
          type: 'insert.block',
          block: {_type: 'sectionBreak', kind: 'break'},
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
