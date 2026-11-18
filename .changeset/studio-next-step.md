---
'sanity-plugin-writing-room': minor
---

The room follows a Studio's `document.actions`.

- Where a Studio puts an action of its own first ("Request review"), the room shows it in Publish's place and runs it as the form does. Its `confirm` is asked in the room's own panel; other dialogs open over the room.
- Where a Studio removed Publish and added nothing, the room has no Publish button. Before, the room published regardless.
- A Studio that left its actions alone sees no change.
