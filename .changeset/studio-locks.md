---
'sanity-plugin-writing-room': minor
---

The room respects the locks a Studio already has.

- A document the Writer's role can't change opens to read: the title, the body and Details. Before, the body took typing that was never saved.
- `readOnly` in the schema is followed for the Prose as it already was for Details: on the document type it locks the room, on the title or the body it locks that field. Functions of the document and the current user work as they do in the form.
- Someone who can write but not publish no longer sees a Publish button that fails.
- Typing where nothing can be changed says why, and the status reads "· read only" when the Writer can't unlock it.
