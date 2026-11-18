# Roadmap

**Goal.** A calm, full-screen place to write in any Sanity Studio, set up with one line: `writingRoom({types: ['post']})`. The room reads everything else from the Studio's own schema.

## Done

- **Extracted** from the Calm Editor template into a Studio plugin (November 2026), then moved into this repository so Calm Editor installs it from npm like any other Studio.
- **Zero config in any Studio:**
  - `types`, with each type's title, body, slug, published date and cover image detected from the schema.
  - The editor follows each body type's own allowed blocks.
  - Placeholders for blocks the room doesn't know.
  - "All …" links that work with any Structure.
  - Prefixed block types the plugin registers itself.
  - Setup problems that explain themselves.
- **Details in the room** (November 2026): every field that isn't the title or the body, edited without leaving. The room's own inputs for simple fields; Sanity's form for the rest. See `docs/adr/0001-details-use-the-studio-form.md`.
- **Scheduling** (November 2026): publish at a time chosen in the room, through Sanity's Scheduled Drafts. It's offered in the panel that asks before publishing; a scheduled document is locked, shows what will go live, and is unlocked to change it or its time. Nothing to configure: the room offers it wherever the Studio has scheduled drafts.
- **Locks the Studio already has** (November 2026): the room takes no changes where the Writer's role doesn't allow them or the schema's `readOnly` says so, for the whole document or for the title or body alone, and says why. Nothing to configure.
- **Look and feel:**
  - Fonts shipped with the plugin.
  - Tokens scoped to the room.
  - An `accent` option: the one colour a Studio can change.
  - An optional matching theme (`sanity-plugin-writing-room/theme`).
- **Hardening:**
  - CI on every pull request.
  - A smoke test against the declared minimum and the latest `sanity`, standalone and embedded in Next.js.
  - Guards against a second App SDK or `@portabletext` copy.
- **Release:**
  - Changesets.
  - Publishing from CI through npm trusted publishing, with provenance.

## Next

- [ ] **Scheduling, by hand and in the pictures.** The browser tests schedule, lock, unlock and go live against a real project. Still to do: try Preview on a locked document against a real site, and add the schedule panel and the locked room to `pnpm shots` and `pnpm vrt`.
- [ ] **The rest of the Studio's locks.** Still to do: leave Publish out when a Studio has removed the publish action from `document.actions` (a replaced action that keeps the name can't be told apart); lock a document that is linked to Canvas; and try a role that can't edit, and a `readOnly` rule, by hand and in the browser tests, which need a second login and a type with a rule.
- [ ] **Details when scheduling from Structure.** Studio's "Schedule publish" doesn't settle the slug or stamp the date as the room does. A plugin can't wrap it (Studio's own scheduled drafts plugin runs after every other and puts its action back), so the choice is an action a Studio adds in its own config, or leaving it.
- [ ] **Try the room by hand in a real Studio** (writing, the Insert Menu on a `blockContent` body, publishing, Preview). Everything since the extraction is covered by tests and builds, not by someone writing in it.
- [ ] **README screenshot or GIF**, and a **Sanity Exchange** listing.
- [ ] **Sanity's inputs in the room's theme.** In Details, references, images and arrays take the Studio's theme, so they only match the room in a Studio that uses `sanity-plugin-writing-room/theme`. Wrap them in the room's theme without making `@sanity/themer` a required dependency.
- [ ] **Browser tests in CI.** The Playwright tests (`pnpm e2e`) exist and the CI job is written; it needs a test project and the three `SANITY_E2E_*` secrets to do anything.
- [ ] **Widen the `sanity` range?** 6.12.0 through 6.21.x pass the smoke test with `--loose` (6.12 is the first release on App SDK v3 and `@portabletext/editor` 8); 6.11 and older get a second SDK and editor copy. Try writing, publishing and previewing in a 6.12 Studio before lowering the peer from `^6.22.0`.
- [ ] **Auto-updates.** Revisit the `autoUpdates: false` requirement whenever Sanity ships an App SDK that shares context with an auto-updated Studio.

## Later

Planned, not started.

- [ ] **Paste to import, with field mapping** (possibly). Paste a whole piece written elsewhere and have the room sort it into the document: title, body, excerpt and the rest of Details. One option for the mapping is TypeSafe's Jev model, which answers choice questions with a probability for each option. Jev can't be called from the browser today (`sanity-plugin-jev-fields` reaches it through Vercel AI Gateway), so this would need a key and has to stay optional: the room must work the same without it.

## Decisions

- **Name: `sanity-plugin-writing-room`, unscoped.** It follows Sanity's `sanity-plugin-*` convention, so people find it on npm and the Sanity Exchange.
- **Zero config is the goal.** Setup is the `types` list. Anything the room can read from the schema, it reads; options exist only to override what it detects.
- **The plugin never registers your names.** It doesn't add `post` or `body`; it works with the document types you already have. It registers its own block types under prefixed names (`writingRoomEmbed`), so they can't clash. `writingRoomSchemaTypes` is an optional starter you register yourself.
- **Its own repository** (2026-11-10), public, so the package has provenance and working links. The design tokens and embed parsing are copies (`src/tokens.ts`, `src/embed.ts`) of the ones Calm Editor's Reading Site uses; keep them in step by hand.
