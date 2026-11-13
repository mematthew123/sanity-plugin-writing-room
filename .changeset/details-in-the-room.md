---
'sanity-plugin-writing-room': minor
---

Details are now edited inside the room.

- **Details** swaps the body for the document's other fields instead of leaving for the Structure form: every field that isn't the title or the body, on one page in schema order. The title stays put, and the arrow or Esc goes back to the writing.
- Simple fields (strings, text, numbers, booleans, dates, slugs, tag lists) get the room's own inputs. References, images, arrays of objects, lists of choices and your own custom inputs use Sanity's form, as they look in the rest of your Studio.
- A publish blocked by a Details field opens Details at that field, and so does the "Add a cover image" nudge.
- Save state and Publish wait for Details to be saved as well as the writing.
- A type with only a title and a body has no Details button.
- A block the room doesn't know now reads **Edit in Structure** (it was "Edit in Details"); it still opens that block in the standard form.
- If the Details view can't be shown, the room says so and offers **Open in Structure**.
