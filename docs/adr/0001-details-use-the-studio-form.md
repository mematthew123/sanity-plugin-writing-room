---
status: accepted
---

# Details are edited in the room, through the Studio's own form

The Details button used to leave the room for the Structure form, because the room only understands five fields (title, body, slug, published date, image). We decided the Writer edits every other field without leaving: Details is a view that takes the body's place in the column, and its fields are rendered by Sanity's form (`useDocumentForm` and `FormBuilder`) rather than by inputs of our own. The room draws the field chrome and the simple inputs (string, text, number, boolean, date, slug, tags) itself; references, images, arrays of objects and a Studio's custom inputs fall through to Sanity's.

We chose this because the room promises zero config in any Studio. Only Sanity's form can render an arbitrary schema, with its `hidden` and `readOnly` rules, validation and custom inputs.

## Considered Options

- **A field generator of our own, end to end.** It keeps the room's look everywhere, but it means rebuilding references, asset handling, array editing and conditional fields, and it can never render a Studio's custom inputs.
- **A known handful of fields in the room, the rest in Structure.** Small to build, but it leaves two places called Details and keeps the trip this change exists to remove.
- **A modal over the Prose.** Sanity's inputs open popovers and dialogs of their own, which would stack on the modal; DESIGN.md allows one floating thing at a time.

## Consequences

- The room hosts two kinds of input: its own, and Sanity's. This is deliberate. Sanity's take the Studio's theme, so they match the room only in a Studio that uses the room's theme; wrapping them in it without requiring `@sanity/themer` is still open.
- The room writes through two document stores: the App SDK for the Prose, the Studio's for Details. Save state and the publish gate must wait on both.
- `FormBuilder` is marked `@alpha`. The Details view sits behind an error boundary that offers "Open in Structure", and the smoke test checks that each `sanity` version it runs against still exports what the view is built on.
- An unknown block is Prose, not Details, so its button reads "Edit in Structure" and still opens the standard form.
