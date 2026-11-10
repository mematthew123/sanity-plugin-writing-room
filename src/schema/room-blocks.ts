import {defineArrayMember, defineType} from 'sanity'
import {codeBlock} from './objects/code-block'
import {embed} from './objects/embed'
import {sectionBreak} from './objects/section-break'

/** Prefixed so they can't clash with a Studio's own types. */
export const roomBlockTypes = [
  defineType({...embed, name: 'writingRoomEmbed', title: 'Embed'}),
  defineType({...codeBlock, name: 'writingRoomCodeBlock', title: 'Code Block'}),
  defineType({...sectionBreak, name: 'writingRoomSectionBreak', title: 'Section Break'}),
]

/** Spread into your body type's `of` to offer the room's embeds, code blocks and section breaks. */
export const writingRoomBlocks = roomBlockTypes.map((type) => defineArrayMember({type: type.name}))
