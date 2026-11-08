# sanity-plugin-writing-room

A calm, full-screen place to write long-form Posts inside Sanity Studio.

Most Studios put writing in a form: panes, field labels and a toolbar around every sentence. The Writing Room is a Studio Tool with its own route that shows only a Post's title and body, and gets out of the way while you type. Everything else about a Post (slug, excerpt, cover image, tags) stays in the standard form, one click away.

> **Status: pre-release.** This package is being extracted from the [Calm Editor template](https://github.com/mematthew123/calm-editor) and isn't on npm yet. The API below may change before 1.0. See [`docs/plugin-roadmap.md`](../../docs/plugin-roadmap.md).

## Install

```sh
npm install sanity-plugin-writing-room
```

Peer dependencies: `sanity` 6, `react` and `react-dom` 19, `styled-components` 6, `@sanity/sdk-react` 3 and `@portabletext/editor` 8. Sanity Studio already depends on the last two; install them in your Studio too so there is exactly one copy of each.

## Use

```ts
// sanity.config.ts
import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {writingRoom, writingRoomSchemaTypes} from 'sanity-plugin-writing-room'

export default defineConfig({
  // …projectId, dataset
  plugins: [
    structureTool(),
    writingRoom({
      preview: {origin: 'http://localhost:3000'},
    }),
  ],
  schema: {types: writingRoomSchemaTypes},
})
```

The plugin adds:

- the **Writing Room** Tool at `/writing-room`, with a Lobby of recent Posts;
- an **Open in Writing Room** action on Posts;
- a wrapper around the built-in **Publish** on Posts, so a Post published from the form gets the same settled slug and published date as one published from the room.

### Schema

The room writes `post` documents whose `body` is the `body` type. `writingRoomSchemaTypes` holds both, plus the block types the room knows how to render (`embed`, `codeBlock`, `sectionBreak`). Each is also exported on its own (`post`, `body`, `embed`, `codeBlock`, `sectionBreak`) if you'd rather compose them.

The room reads and writes `title`, `body`, `slug` and `publishedAt`. Only Prose (title, body, and alt text on body images) should *block* a publish, because the Writer can't fix anything else from inside the room.

### Options

| Option | Default | What it does |
|---|---|---|
| `preview.origin` | — | Your site's origin. Setting `preview` turns on the room's Preview button. |
| `preview.enablePath` | `/api/draft-mode/enable` | The route that checks the preview secret and turns on draft mode (the `next-sanity` convention). |
| `preview.pathname` | `(slug) => '/posts/' + slug` | Where a Post is read on your site. |

Leave `preview` out and the Preview button is hidden.

## Requirements and caveats

- **Turn Studio auto-updates off** (`deployment.autoUpdates: false` in `sanity.cli.ts`). The room uses the App SDK (`@sanity/sdk-react`). An auto-updating Studio loads `sanity` from a CDN but bundles its own copy of the SDK, and the two never share a React context, so the room crashes with "SanityInstance context not found".
- **Fonts.** The room is set in Newsreader (prose) and Figtree (controls), falling back to Georgia and the system UI font. Load them in your Studio, for example with `@fontsource-variable/newsreader` and `@fontsource-variable/figtree`.

## Develop

This package lives in the Calm Editor monorepo. The template Studio (`apps/studio`) consumes it straight from `src`, so `pnpm dev` at the repo root picks up changes without a build.

```sh
pnpm --filter sanity-plugin-writing-room test       # Vitest
pnpm --filter sanity-plugin-writing-room typecheck
pnpm --filter sanity-plugin-writing-room build      # tsdown → dist/
(cd packages/writing-room && pnpm pack)             # inspect the tarball npm would get
```

`@calm/content` and `@calm/tokens` are private workspace packages, so they're dev dependencies and get bundled into `dist`. `publishConfig` swaps `exports` from `src` to `dist` when the package is packed or published.

## License

[MIT](LICENSE)
