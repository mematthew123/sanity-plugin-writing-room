---
'sanity-plugin-writing-room': minor
---

**Breaking:** the `colors` option is replaced by `accent`, the one colour a Studio can change.

```diff
- writingRoom({colors: {light: {accent: '#2F6FA8'}, dark: {accent: '#8DB8E0'}}})
+ writingRoom({accent: '#2F6FA8'})
+ // or one per scheme: accent: {light: '#2F6FA8', dark: '#8DB8E0'}
```

Give one hex colour and the room uses it in light and dark, adjusting it where it must to stay readable on the room's paper (WCAG AA), and works out the selection highlight and the text on Publish from it. The room's paper, neutrals and caution colour are no longer configurable. `createWritingRoomTheme({colors})` becomes `createWritingRoomTheme({accent})`, and the `WritingRoomColors` type is replaced by `WritingRoomAccent`.
