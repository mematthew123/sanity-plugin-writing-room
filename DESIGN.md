---
name: Writing Room
colors:
  paper: "#FAF7F2"
  surface: "#F2ECE3"
  rule: "#E7DFD4"
  ink: "#2E2823"
  ink-muted: "#6E645B"
  ink-faint: "#A3988C"
  accent: "#A8532F"
  on-accent: "#FAF7F2"
  selection: "rgba(168, 83, 47, 0.18)"
  caution: "#8A5300"
  paper-dark: "#1E1B18"
  surface-dark: "#28241F"
  rule-dark: "#35302A"
  ink-dark: "#EDE6DB"
  ink-muted-dark: "#ADA295"
  ink-faint-dark: "#6F665C"
  accent-dark: "#E39A78"
  on-accent-dark: "#1E1B18"
  selection-dark: "rgba(227, 154, 120, 0.24)"
  caution-dark: "#E5B567"
typography:
  title:
    fontFamily: Newsreader
    fontSize: 2.25em
    fontWeight: 500
    lineHeight: 1.25
  heading:
    fontFamily: Newsreader
    fontSize: 1.5em
    fontWeight: 600
    lineHeight: 1.25
  subheading:
    fontFamily: Newsreader
    fontSize: 1.2em
    fontWeight: 600
    lineHeight: 1.25
  body:
    fontFamily: Newsreader
    fontSize: 1.25rem
    fontWeight: 400
    lineHeight: 1.65
  body-small:
    fontFamily: Newsreader
    fontSize: 1.125rem
    fontWeight: 400
    lineHeight: 1.65
  body-large:
    fontFamily: Newsreader
    fontSize: 1.375rem
    fontWeight: 400
    lineHeight: 1.65
  caption:
    fontFamily: Newsreader
    fontSize: 0.85em
    fontWeight: 400
  code:
    fontFamily: ui-monospace
    fontSize: 0.85em
    fontWeight: 400
  ui:
    fontFamily: Figtree
    fontSize: 0.875rem
    fontWeight: 450
  ui-strong:
    fontFamily: Figtree
    fontSize: 0.875rem
    fontWeight: 600
  ui-small:
    fontFamily: Figtree
    fontSize: 0.8125rem
    fontWeight: 450
spacing:
  xs: 0.25rem
  sm: 0.5rem
  md: 1rem
  lg: 1.5rem
  xl: 2.5rem
  xxl: 4rem
  prose-gap: 1em
  measure: 38rem
rounded:
  sm: 0.5rem
  lg: 0.875rem
  pill: 999px
motion:
  press: 150ms
  gentle: 200ms
  recede: 700ms
  easing: cubic-bezier(0.22, 1, 0.36, 1)
components:
  room-controls:
    textColor: "{colors.ink-muted}"
    typography: "{typography.ui}"
  save-state:
    textColor: "{colors.ink-muted}"
    typography: "{typography.ui-small}"
  save-state-offline:
    textColor: "{colors.caution}"
    typography: "{typography.ui-small}"
  word-count:
    textColor: "{colors.ink-muted}"
    typography: "{typography.ui-small}"
  publish-button:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.ui-strong}"
    rounded: "{rounded.pill}"
    padding: 0.5rem 1rem
  quiet-button:
    textColor: "{colors.ink-muted}"
    typography: "{typography.ui}"
    rounded: "{rounded.pill}"
    padding: 0.5rem 0.75rem
  room-settings:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.ui}"
    rounded: "{rounded.lg}"
    padding: 0.5rem
  publish-confirm:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.ui}"
    rounded: "{rounded.lg}"
    padding: 1.5rem
  room-message:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.ui}"
    rounded: "{rounded.lg}"
    padding: 0.25rem 1rem
  room-message-caution:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.caution}"
    typography: "{typography.ui}"
    rounded: "{rounded.lg}"
    padding: 0.25rem 1rem
  selection-bubble:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.ui}"
    rounded: "{rounded.pill}"
    padding: 0.25rem
  insert-menu:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.ui}"
    rounded: "{rounded.lg}"
    padding: 0.25rem
  link:
    textColor: "{colors.accent}"
  quote:
    textColor: "{colors.ink-muted}"
    typography: "{typography.body}"
  code-block:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.code}"
    rounded: "{rounded.sm}"
    padding: 1rem
  embed-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.ui}"
    rounded: "{rounded.lg}"
    padding: 1rem
  section-break:
    textColor: "{colors.ink-faint}"
    typography: "{typography.body}"
  unknown-block:
    textColor: "{colors.ink-muted}"
    typography: "{typography.ui}"
    rounded: "{rounded.lg}"
    padding: 1rem 1.5rem
  lobby-continue:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    rounded: "{rounded.lg}"
    padding: 1.5rem
  lobby-row:
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: 0.75rem 1rem
  lobby-new-button:
    textColor: "{colors.ink}"
    typography: "{typography.ui-strong}"
    rounded: "{rounded.pill}"
    padding: 0.5rem 1rem
---

# Writing Room design

The visual and interaction language of the Writing Room: its Lobby, the room itself, and the optional Studio theme that matches them.

**Source of truth:** token values live in [`src/tokens.ts`](./src/tokens.ts). The front matter above mirrors them for people and agents, and [`src/design-md.test.ts`](./src/design-md.test.ts) fails if the two disagree. Change the tokens first, then this file. The tokens are a copy of the ones Calm Editor's Reading Site uses (see the README), so a change here is a change there too.

## Words

The room has its own vocabulary. Use these words in the interface, in code and in this file.

- **Writer**: the person writing. Never "user" or "editor".
- **Prose**: what the Writer writes: the title and the body.
- **Details**: everything about a document that isn't Prose: every other field its schema has (slug, excerpt, cover image, tags, a Studio's own fields). The Writer edits them without leaving the room, and they stay out of sight until asked for.
- **Lobby**: the entrance. A doorway to the writing, not a document browser.
- **The room**: one document, open for writing.
- **Room Controls**: the few controls in the room's corners.
- **Post**: the default kind of document. The room names each kind by its schema title ("Case Study"); never say "document" to a Writer.

## Overview

Calm, soft, approachable. The Writing Room should feel like a quiet desk by a window, not like software. Six principles carry every decision:

1. **The Prose is the loudest thing on screen.** Nothing — not a button, not a badge, not an Embed — may draw the eye harder than the words being written.
2. **One accent, used sparingly.** Clay marks the caret, the selection, links, and the one thing to do next. If two clay things are visible at once outside the Prose, one of them is wrong.
3. **Recede, don't vanish.** Room Controls fade while the Writer types and return when they pause. They're always findable, never hidden behind a gesture to learn.
4. **Nothing is urgent unless it truly is.** Only lost connectivity, a blocked publish, or another person in the document may hold attention. Everything else waits quietly.
5. **Warm, not cute.** Soft corners, warm neutrals and friendly words — but no mascots, confetti, emoji or exclamation marks.
6. **Opinionated, not configurable.** The room looks one way. A Studio points it at a schema and may change the accent; a Writer may choose their comfort settings. Nothing else is an option, so everything else can be right.

## Colors

Warm paper and warm ink, never pure white or black. Pure `#fff` on a large screen is the single most tiring thing in most editors.

- **Paper** is the page. **Surface** is a barely-raised tint for things that sit *on* the page: Code Blocks, Embed cards, the Lobby's Continue card, and everything that floats.
- **Ink** is for Prose and for the text of floating panels. **Ink muted** is for Room Controls, captions, placeholders and status. **Ink faint** is decorative only (the Section Break ornament, the Insert Menu's `+`, a switch that's off) and must never carry meaning on its own.
- **Rule** is for hairlines. Use it rarely; whitespace separates better.
- **Accent (clay)** for the caret, selection highlight, links in Prose, and the one primary action in view: Publish in the room, Continue in the Lobby. Nothing else.
- **Caution** for the few messages that must not recede: offline, a blocked publish, something that couldn't be done.

**Dusk (dark mode)** uses the `-dark` tokens: warm charcoal paper, cream ink, and a lighter clay so the accent still reads. The room follows the Studio's colour scheme; the Writer can switch it from Room Settings.

**Contrast:** Prose sits between 10:1 and 16:1 against paper — comfortably legible without harshness. Ink muted, accent and caution all meet WCAG AA (4.5:1) on paper, and ink and ink muted meet it on surface. These are enforced by tests.

### The accent is the one colour a Studio can change

`writingRoom({accent: '#2F6FA8'})` replaces clay. The room, not the Studio, is responsible for the result:

- the colour is moved toward the ink until it meets AA on that scheme's paper, so no choice can make the room hard to read;
- the selection highlight and the text on the accent are worked out from it;
- one colour serves both schemes, unless the Studio gives one each.

Paper, the neutrals and caution are not options. Don't add a colour option; if a Studio needs one, the design is missing something, so fix the design.

## Typography

Two typefaces, each with one job:

- **Newsreader** (variable, with a true italic) for everything that is Prose or stands in for it: the title, body, headings, quotes, and the titles and excerpts of documents in the Lobby.
- **Figtree** (variable) for everything that is *not* Prose: Room Controls, labels, status, menus. The change of typeface is how the Writer knows a thing isn't part of their writing.
- **System monospace** for Code Blocks.

Both ship with the plugin (Latin and Latin Extended) and load the first time the room opens. Other scripts fall back to Georgia and the system UI font. Anything sized to its text (the title) must re-measure when the fonts arrive.

Prose sizes are relative to the body size, which the Writer chooses in Room Settings: **small** (`body-small`), **medium** (`body`, default) or **large** (`body-large`). Title, heading, subheading, caption and code are `em`-based so the whole page scales together.

- The **title** is the page's only `h1`. Bodies use **Heading** (`h2`) and **Subheading** (`h3`); never label them "H2/H3" to Writers.
- Keep the measure at `38rem` (~68 characters). Never let Prose run wider, even on a large monitor.
- Use `text-wrap: pretty` on Prose and `text-wrap: balance` on the title and headings.
- Quotes are body size, in ink muted, with a soft clay rule on the inline-start edge — not italicised wholesale and not enlarged.

## Layout

A single centred column, the width of the measure, with generous space above the title (`xxl`, less on a phone) so the first line never feels crammed against the top of the window.

### The room

Nothing but the column, with three things around it.

- **Room Controls**, in a bar across the top. **Leave** at the start. At the end, in this order: presence, save state, status, **Aa** (Room Settings), **Details**, **Preview**, **Publish**. That is the whole list. Anything new goes in Room Settings or doesn't go in.
- The bar has paper behind it, fading out below, so Prose never scrolls through the controls.
- **The foot**, pinned to the bottom of the window: the word count in the start margin, and the room's one **message** slot in the middle.
- The Studio's navbar is hidden while a document is open.

### The Lobby

The same column, under the Studio's navbar. From the top:

1. a quiet greeting, with **New** beside it;
2. **Continue writing**: the one large thing on the page;
3. **Recent**: at most five more, as quiet rows;
4. one link: **Browse everything in Structure**.

The Lobby never grows a search box, filters, pagination or tabs. Structure has those. If nothing has been written yet, the Lobby shows one card and one button.

### In the column

- Prose blocks are separated by `prose-gap` (`1em`); headings get roughly double that above them and the standard gap below, so they belong to what follows.
- Images, Embeds and Code Blocks stay within the measure. Nothing bleeds full-width.

### Widths

The room is designed for every width, phone included. Two breakpoints, both in `src/room/primitives.tsx`:

- **`NARROW`** (40rem and under): the bar keeps Leave (as an arrow), presence, save state, Aa and Publish. Status is dropped (Publish's label already says it); Details and Preview move into Room Settings.
- **`NO_MARGIN`** (64rem and under): there's no margin beside the column, so the word count moves into Room Settings.

Things that live in the margin (the Insert Menu's `+`) move inside the column when the margin runs out, and grow to a size a thumb can hit. Floating things never extend past the window; they scroll inside themselves instead. Nothing ever wraps onto a second row of controls: when the bar runs short, text shortens, then things move into Room Settings.

## Elevation & Depth

Almost flat. Depth comes from the paper/surface tint, not shadows.

- Five things float, and only one at a time: the **Selection Bubble**, the **Insert Menu**, **Room Settings**, the **publish confirmation**, and the **message** at the foot. In light mode they carry the soft `floatingShadow` token; in dusk they drop the shadow and use a `rule` border instead (shadows don't read on dark paper).
- Code Blocks, Embed cards and the Lobby's Continue card sit *on* the page: surface tint, no shadow, no border.
- Never stack elevations (no card inside a card inside a panel).

## Shapes

Soft, consistent corners.

- `sm` (`0.5rem`) for Code Blocks, images in Prose, and rows inside a floating panel.
- `lg` (`0.875rem`) for floating panels, Embed cards, the Continue card, Lobby rows and the message.
- `pill` for buttons, the Selection Bubble, switches and segmented choices.
- When rounding nests, inner radius = outer radius − padding, so curves stay concentric.

## Components

### In the room

- **Room Controls** — Figtree, ink muted, no backgrounds or borders until hovered or focused. They recede to near-invisible after a few keystrokes and return on pointer movement, a ~2s pause, or keyboard focus. Presence, save state and anything caution-toned ignore the recede.
- **Quiet button** — the default for every control that isn't Publish: text in ink muted, a surface-tinted pill on hover and focus.
- **Leave** — returns the Writer to where they came from: the document's form if they opened it from there, otherwise the Lobby. A document that was never published and is still completely empty is discarded on the way out.
- **Save state** — a small "Saved" that fades after a moment. Offline it reads "Offline", in caution, and stays; the message slot says what that means for the Writer's words.
- **Presence** — "Sam is here too." Never recedes: writing alongside someone without knowing is unsettling.
- **Status** — "Draft", "Published", or "Published · unpublished changes". Words, not a badge.
- **Room Settings (Aa)** — the one menu for how the room looks and feels: text size (S, M, L), typewriter scrolling, focus dimming, dark mode, fullscreen. Each toggle has a label and one line saying what it does. On narrower windows it also holds whatever left the bar. The Writer's choices are theirs, kept in their browser; they are not a Studio's to configure.
- **Publish button** — the only filled clay element in the room. Labels: "Publish" (never published), "Publish changes" (published with edits); absent when there's nothing to publish.
- **Publishing** — a publish is real: readers see it and webhooks run. So it's a moment, in three steps:
  1. *Check.* If something blocks the publish, don't list errors: take the Writer to the first one and say what it is.
  2. *Ask once.* A small panel under the button says where the document will go live (the site's address when the room knows it, otherwise the slug) and offers **Publish now** and **Not yet**. Enter confirms; Esc backs out. While it's open, the bar's button steps back to a surface tint, so the answer is the only clay thing.
  3. *Say so.* The message slot shows a clay tick and "Published", with a link to the live page when the room knows the address, and a nudge toward the cover image if there isn't one.
- **Message** — the one place the room speaks up, at the foot of the window and clear of the controls. One at a time, in this order of precedence: a problem (caution; stays until dismissed or resolved), offline (caution; stays), a notice (ink; passes after a few seconds, longer when it offers somewhere to go). Never a stack of toasts.
- **Word count** — "1,240 words · 6 min read", in ink muted, in the margin at the foot. It recedes with the controls. It is information, never a goal.
- **Selection Bubble** — a surface pill above selected text: Bold, Italic, Link, Heading, Subheading, Quote. Appears with the `gentle` motion, never covers the selected line.
- **Insert Menu** — opened from the faint `+` beside an empty line, or `/` at the start of one. A short list with an icon and a plain-language label each: Image, Embed, Code block, Section break, Quote, lists.
- **Only what the body can store.** The Selection Bubble, Insert Menu and markdown shortcuts offer exactly what the document's own body field allows. Never show a control that would write something the schema can't hold.
- **Image** — at the measure, `sm` corners. Beneath it, in Figtree: "Describe this image for people who can't see it" and "Add a caption (optional)" as quiet inline placeholders until clicked. A soft shimmer holds its place while it uploads.
- **Embed card** — a quiet surface card with the provider's name, the caption or URL, and a "Preview" toggle. Never a live, autoplaying player by default.
- **Code Block** — surface tint, monospace, no line numbers and no syntax colouring in the room. Language label in Figtree, ink muted, top-end.
- **Section Break** — a centred `✦ ✦ ✦` in ink faint with a full `xl` of space either side.
- **Unknown block** — a Studio's own block the room can't show keeps its place as a dashed, quiet card with its name and "Edit in Details". The Writer can move or delete it; the room never pretends to render it.

### In the Lobby

- **Greeting** — "Good morning, Sam", in Newsreader at body size, ink muted. A hello, not a headline.
- **New** — an outlined pill: "New Post". With several kinds of writing it reads "New" and asks which. It says "Starting…" while it works. It is deliberately modest: most visits are to continue something.
- **Continue card** — a surface card: the title in Newsreader, the first two lines of the body in ink muted, then one Figtree line (status, word count, "Edited 2 hours ago") and "Continue →" in clay. It is the document the Writer last had open in the room, or failing that the most recently edited one.
- **Row** — the title in Newsreader at body size on one line, then one Figtree line: status and relative time. A small muted dot marks anything readers haven't seen yet ("Draft", "Unpublished changes"); "Published" has none. An untitled document reads "Untitled" in ink muted.
- **Discard** — appears on a row only when the document was never published and is completely empty, Details included. It's the same tidy-up the room does by itself on Leave, so it doesn't ask first. See the last Don't.
- **Nothing written yet** — one surface card, one sentence, and the only filled clay button the Lobby ever shows: "Start your first Post".

## Motion

Unhurried and small. Motion explains a change; it never decorates.

- `press` (150ms) for a control being pressed, so a click feels received at once.
- `gentle` (200ms) for small responses: hover, a floating panel or the message appearing, a switch moving.
- `recede` (700ms) for Room Controls fading out and back, and for focus dimming. Slow enough that the Writer feels it rather than sees it.
- One easing everywhere: `cubic-bezier(0.22, 1, 0.36, 1)` — quick to start, soft to settle.
- Opacity and small translations (≤ 4px) only. No bouncing or sliding panels. The one scale is a press: a control shrinks slightly while held (0.97 for small buttons, 0.99 for cards and rows, whose text would otherwise read as moving).
- Under `prefers-reduced-motion`, changes are instant, and Room Controls never drop below readable contrast while they have keyboard focus.

## Voice & Copy

Plain, warm, brief. Write like a considerate person sitting beside the Writer.

- Say what happened and what to do, in that order: "This link isn't from YouTube, Vimeo or Spotify." not "Invalid URL."
- Frame requirements as help: "Describe this image for people who can't see it."
- Offer a way out in the Writer's words: "Not yet", not "Cancel".
- When something fails, say it couldn't be done *just now* and that trying again is fine. Never blame, never show an error code.
- Sentence case everywhere. No exclamation marks, no emoji, no "Oops".
- Status is described in the Writer's words: "Draft", "Published", "Unpublished changes". Never "dirty", "synced" or "version".
- Reassure only when it's true and useful: "Your words are safe here" appears only when the room is actually holding unsynced edits.
- Use the words under [Words](#words).

## Using the tokens in code

**Reuse the token, don't fork it.** If you're about to type a hex code, a font stack, a radius or a duration, stop and find the token.

For any styling value, work down this list and stop at the first that applies:

1. **A CSS custom property** — `var(--calm-color-ink)`, `var(--calm-font-prose)`, `var(--calm-radius-large)`, `var(--calm-motion-recede)`. Colour properties re-resolve per scheme, so the component works in light and dusk with no extra work.
2. **The TypeScript export** — `import {palette, fonts} from './tokens'` — only where CSS variables can't reach: the Studio theme (`buildTheme` needs literal colours) and the accent maths.
3. **A literal** — not for colour, type, spacing, radius or motion. Add a token instead, update this file, and let the tests confirm contrast. The exceptions are a control's own dimensions (a 2.25rem button, a switch's track) and the two breakpoints, which are named constants.

Naming in CSS is `--calm-{group}-{token}` in kebab-case: `--calm-color-ink-muted`, `--calm-type-heading`, `--calm-space-lg`, `--calm-weight-title`.

**The room's styles never leave the room.** The tokens are rendered as a `<style>` scoped to the room's own elements (`[data-calm-surface]`, and `[data-calm-floating]` for panels portaled to the body), never to `:root`. A Studio that installs the plugin must look exactly as it did everywhere outside the room, and needs no CSS loader.

## Do's and Don'ts

**Do**
- Let whitespace do the separating before reaching for a border.
- Keep every surface warm — tint neutrals toward the paper, never toward blue.
- Keep only one clay thing outside the Prose at a time.
- Test every new colour in both light and dusk, and keep the contrast tests green.
- Look at every change at phone width as well as on a desktop.
- Put a new control in Room Settings, or ask whether it's needed at all.

**Don't**
- Don't use pure white, pure black, or cool greys.
- Don't add a fixed toolbar, a sidebar, or anything persistent beside the column.
- Don't animate anything while the Writer is typing except the receding Room Controls.
- Don't show streaks, goals, targets or progress pressure. A word count is information; a word goal is not.
- Don't add an option where a decision would do.
- Don't turn the Lobby into a document browser.
- Don't put a destructive action (unpublish, delete, discard) in the room. The one exception anywhere is the Lobby's Discard on a document that is completely empty, where there is nothing to lose.
