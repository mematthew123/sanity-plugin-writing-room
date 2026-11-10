import {defineArrayMember, defineType} from 'sanity'
import {codeBlock} from './objects/code-block'
import {embed} from './objects/embed'
import {sectionBreak} from './objects/section-break'

/**
 * The room's own blocks under names the plugin registers itself: prefixed, so they can't clash
 * with a Studio's types. Same fields and validation as the starter schema's `embed`, `codeBlock`
 * and `sectionBreak`, which keep their names for content that already uses them.
 */
export const roomBlockTypes = [
  defineType({...embed, name: 'writingRoomEmbed', title: 'Embed'}),
  defineType({...codeBlock, name: 'writingRoomCodeBlock', title: 'Code Block'}),
  defineType({...sectionBreak, name: 'writingRoomSectionBreak', title: 'Section Break'}),
]

/**
 * Add these to your own body type's `of` to offer the room's embeds, code blocks and section
 * breaks: `of: [{type: 'block'}, {type: 'image'}, ...writingRoomBlocks]`. Your site renders them
 * as `writingRoomEmbed`, `writingRoomCodeBlock` and `writingRoomSectionBreak`.
 */
export const writingRoomBlocks = roomBlockTypes.map((type) => defineArrayMember({type: type.name}))
