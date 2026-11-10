# sanity-plugin-writing-room

## 0.0.2

### Patch Changes

- [#16](https://github.com/mematthew123/calm-editor/pull/16) [`6985acd`](https://github.com/mematthew123/calm-editor/commit/6985acdb4d7a017db7f94f3553756a0daeb9b7ba) Thanks [@mematthew123](https://github.com/mematthew123)! - The README's links to the changelog, roadmap and licence now work on npm.

## 0.0.1

The first release, to hold the name on npm. The API may change before 1.0.

- The Writing Room: a full-screen Studio Tool for long-form writing, with a Lobby, controls that recede, formatting on selection, an insert menu, markdown shortcuts, room settings, live sync and presence, publishing and preview from the room.
- `writingRoom({types})` writes any document type. The room finds each type's title, portable text body, slug, published date and cover image in its schema, and only offers what that body can store.
- Embeds, code blocks and section breaks as `writingRoomEmbed`, `writingRoomCodeBlock` and `writingRoomSectionBreak`, registered by the plugin; opt in with `...writingRoomBlocks`.
- Fonts (Newsreader, Figtree) ship with the plugin; the room's colours stay inside it and can be changed with `colors`.
- An optional matching Studio theme from `sanity-plugin-writing-room/theme`.
- `writingRoomSchemaTypes`: a starter `post` and `body` for Studios without one.
