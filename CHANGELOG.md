# sanity-plugin-writing-room

## 0.4.0

### Minor Changes

- [#16](https://github.com/mematthew123/sanity-plugin-writing-room/pull/16) [`be9e0b2`](https://github.com/mematthew123/sanity-plugin-writing-room/commit/be9e0b20ae91b6b2ac1c927a544ef67d395f7a94) Thanks [@mematthew123](https://github.com/mematthew123)! - Choose an image that already exists. The Insert Menu now has two image rows, "Upload an image" and "Choose an image". The second offers the image sources your Studio has set up (its own uploads, Media Library, any a plugin adds) and opens the one you pick in its own dialog. The room follows your Studio's `form.image` settings and the body image type's `options.sources`, and no longer uploads a pasted or dropped image in a Studio that has turned uploads off.

### Patch Changes

- [#16](https://github.com/mematthew123/sanity-plugin-writing-room/pull/16) [`be9e0b2`](https://github.com/mematthew123/sanity-plugin-writing-room/commit/be9e0b20ae91b6b2ac1c927a544ef67d395f7a94) Thanks [@mematthew123](https://github.com/mematthew123)! - Numbered lists in the room count 1, 2, 3 again. They were showing 1, 1, 2.

## 0.3.0

### Minor Changes

- [#7](https://github.com/mematthew123/sanity-plugin-writing-room/pull/7) [`e3371fb`](https://github.com/mematthew123/sanity-plugin-writing-room/commit/e3371fbba6ff7d7e9fe0f248fbc6a61c5ec79fd4) Thanks [@mematthew123](https://github.com/mematthew123)! - Details are now edited inside the room.

  - **Details** swaps the body for the document's other fields instead of leaving for the Structure form: every field that isn't the title or the body, on one page in schema order. The title stays put, and the arrow or Esc goes back to the writing.
  - Simple fields (strings, text, numbers, booleans, dates, slugs, tag lists) get the room's own inputs. References, images, arrays of objects, lists of choices and your own custom inputs use Sanity's form, as they look in the rest of your Studio.
  - A publish blocked by a Details field opens Details at that field, and so does the "Add a cover image" nudge.
  - Save state and Publish wait for Details to be saved as well as the writing.
  - A type with only a title and a body has no Details button.
  - A block the room doesn't know now reads **Edit in Structure** (it was "Edit in Details"); it still opens that block in the standard form.
  - If the Details view can't be shown, the room says so and offers **Open in Structure**.

### Patch Changes

- [#7](https://github.com/mematthew123/sanity-plugin-writing-room/pull/7) [`d459d13`](https://github.com/mematthew123/sanity-plugin-writing-room/commit/d459d13850b6e789898e9260dae8d0fec4ba2cbf) Thanks [@mematthew123](https://github.com/mematthew123)! - Details and publishing are sturdier. Publish waits for a validation of the draft as it is saved, and stops if the slug or date changed while you were deciding. Leaving no longer discards a draft that has only Details filled in, and a slug typed in Details isn't replaced by the next title edit. In Details: tags, numbers, dates and web addresses behave better, a publish problem inside an object goes to the field itself, and Escape in a popover closes the popover rather than Details.

- [#7](https://github.com/mematthew123/sanity-plugin-writing-room/pull/7) [`0d1fbda`](https://github.com/mematthew123/sanity-plugin-writing-room/commit/0d1fbda3f5a4b4c6b60caed3d78a94e827afef65) Thanks [@mematthew123](https://github.com/mematthew123)! - Publish now waits for validation to finish. A publish started in the first moment after opening a document, before validation had run, could go through with a required field still empty.

## 0.2.0

### Minor Changes

- [#4](https://github.com/mematthew123/sanity-plugin-writing-room/pull/4) [`a7b4eae`](https://github.com/mematthew123/sanity-plugin-writing-room/commit/a7b4eae79476539b40a07cb7a3670779d2413061) Thanks [@mematthew123](https://github.com/mematthew123)! - A calmer control bar, and a room that works on narrow screens.

  - The Room Controls are now Leave on one side and status, `Aa`, Details, Preview and Publish on the other. Dark mode and fullscreen moved into the `Aa` menu (⌘/Ctrl + Shift + F still works), and its toggles are proper switches.
  - The word count moved to the foot of the page. Problems, the offline message and notices such as "Published" appear there too, in one place, instead of crowding the controls.
  - The controls have paper behind them, so the text no longer scrolls through them.
  - On a phone or a narrow window the bar keeps Leave, `Aa` and Publish; Details, Preview and the word count are in the `Aa` menu. The Insert Menu's `+` moves to the end of the line when there's no margin for it, and the selection bubble stays inside the window.

- [#4](https://github.com/mematthew123/sanity-plugin-writing-room/pull/4) [`a716c79`](https://github.com/mematthew123/sanity-plugin-writing-room/commit/a716c79ed5bb2ca0508bf5edb39bc3c444b9c684) Thanks [@mematthew123](https://github.com/mematthew123)! - The Lobby is now a doorway rather than a document browser.

  - **Continue writing**: the document you last had open in the room (remembered per browser, per project and dataset; otherwise the most recently edited one), shown large with its first lines, word count and when it was last edited.
  - **New**: one modest button ("New Post"); with several types it asks which. It shows when it's working and says so if a document couldn't be started.
  - **Recent**: five more, with a dot on anything readers haven't seen yet, and **Discard** on a start that was never written in.
  - One **Browse everything in Structure** link replaces the per-type "All …" links.
  - The Studio's navbar now stays in the Lobby and steps aside only while a document is open, so the Lobby no longer needs its own Leave button or theme toggle.
  - **Leave** takes you back where you came from: to the document's form if you opened it with "Open in Writing Room", otherwise to the Lobby.

- [#4](https://github.com/mematthew123/sanity-plugin-writing-room/pull/4) [`b02b423`](https://github.com/mematthew123/sanity-plugin-writing-room/commit/b02b423e0625015971013c607ab772660d4b8bad) Thanks [@mematthew123](https://github.com/mematthew123)! - **Breaking:** the `colors` option is replaced by `accent`, the one colour a Studio can change.

  ```diff
  - writingRoom({colors: {light: {accent: '#2F6FA8'}, dark: {accent: '#8DB8E0'}}})
  + writingRoom({accent: '#2F6FA8'})
  + // or one per scheme: accent: {light: '#2F6FA8', dark: '#8DB8E0'}
  ```

  Give one hex colour and the room uses it in light and dark, adjusting it where it must to stay readable on the room's paper (WCAG AA), and works out the selection highlight and the text on Publish from it. The room's paper, neutrals and caution colour are no longer configurable. `createWritingRoomTheme({colors})` becomes `createWritingRoomTheme({accent})`, and the `WritingRoomColors` type is replaced by `WritingRoomAccent`.

- [#4](https://github.com/mematthew123/sanity-plugin-writing-room/pull/4) [`b02b423`](https://github.com/mematthew123/sanity-plugin-writing-room/commit/b02b423e0625015971013c607ab772660d4b8bad) Thanks [@mematthew123](https://github.com/mematthew123)! - Publishing from the room is now a moment, not a click.

  - Publish checks the document as before, then shows where it will go live (your site's address when `preview` is set, otherwise the slug) and asks once: **Publish now** or **Not yet**. Enter confirms, Esc backs out.
  - Afterwards the room says "Published" with a link to **View it live** (when `preview` is set), alongside the cover-image nudge, and keeps it on screen long enough to reach.
  - The title now re-fits itself when the window narrows or the room's fonts load, so a long title is never cut off.

## 0.1.0

### Minor Changes

- [`2590bb1`](https://github.com/mematthew123/sanity-plugin-writing-room/commit/2590bb1fc4fc5e05d373d33fe1c984150e2594cb) Thanks [@mematthew123](https://github.com/mematthew123)! - The plugin now lives in its own repository, [mematthew123/sanity-plugin-writing-room](https://github.com/mematthew123/sanity-plugin-writing-room), and is published from there with npm provenance. Nothing about the plugin's API or behaviour changes.

## 0.0.2

### Patch Changes

- The README's links to the changelog, roadmap and licence now work on npm.

## 0.0.1

The first release, to hold the name on npm. The API may change before 1.0.

- The Writing Room: a full-screen Studio Tool for long-form writing, with a Lobby, controls that recede, formatting on selection, an insert menu, markdown shortcuts, room settings, live sync and presence, publishing and preview from the room.
- `writingRoom({types})` writes any document type. The room finds each type's title, portable text body, slug, published date and cover image in its schema, and only offers what that body can store.
- Embeds, code blocks and section breaks as `writingRoomEmbed`, `writingRoomCodeBlock` and `writingRoomSectionBreak`, registered by the plugin; opt in with `...writingRoomBlocks`.
- Fonts (Newsreader, Figtree) ship with the plugin; the room's colours stay inside it and can be changed with `colors`.
- An optional matching Studio theme from `sanity-plugin-writing-room/theme`.
- `writingRoomSchemaTypes`: a starter `post` and `body` for Studios without one.
