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

- [ ] **Try the room by hand in a real Studio** (writing, the Insert Menu on a `blockContent` body, publishing, Preview). Everything since the extraction is covered by tests and builds, not by someone writing in it.
- [ ] **README screenshot or GIF**, and a **Sanity Exchange** listing.
- [ ] **Sanity's inputs in the room's theme.** In Details, references, images and arrays take the Studio's theme, so they only match the room in a Studio that uses `sanity-plugin-writing-room/theme`. Wrap them in the room's theme without making `@sanity/themer` a required dependency.
- [ ] **Browser tests in CI.** The Playwright tests (`pnpm e2e`) exist and the CI job is written; it needs a test project and the three `SANITY_E2E_*` secrets to do anything.
- [ ] **Widen the `sanity` range?** 6.12.0 through 6.21.x pass the smoke test with `--loose` (6.12 is the first release on App SDK v3 and `@portabletext/editor` 8); 6.11 and older get a second SDK and editor copy. Try writing, publishing and previewing in a 6.12 Studio before lowering the peer from `^6.22.0`.
- [ ] **Auto-updates.** Revisit the `autoUpdates: false` requirement whenever Sanity ships an App SDK that shares context with an auto-updated Studio.

## Decisions

- **Name: `sanity-plugin-writing-room`, unscoped.** It follows Sanity's `sanity-plugin-*` convention, so people find it on npm and the Sanity Exchange.
- **Zero config is the goal.** Setup is the `types` list. Anything the room can read from the schema, it reads; options exist only to override what it detects.
- **The plugin never registers your names.** It doesn't add `post` or `body`; it works with the document types you already have. It registers its own block types under prefixed names (`writingRoomEmbed`), so they can't clash. `writingRoomSchemaTypes` is an optional starter you register yourself.
- **Its own repository** (2026-11-10), public, so the package has provenance and working links. The design tokens and embed parsing are copies (`src/tokens.ts`, `src/embed.ts`) of the ones Calm Editor's Reading Site uses; keep them in step by hand.
