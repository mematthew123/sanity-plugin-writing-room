# sanity-plugin-writing-room

A calm, full-screen place to write long-form Posts inside Sanity Studio.

Most Studios put writing in a form: panes, field labels and a toolbar around every sentence. The Writing Room is a Studio Tool with its own route that shows only a Post's title and body, and gets out of the way while you type. Everything else about a Post (slug, excerpt, cover image, tags) stays in the standard form, one click away.

- **The Lobby**: start a new Post or pick up a recent one.
- **Controls that recede**: Leave, Details, Preview, Publish and save state fade after a few keystrokes and return when you pause.
- **Formatting on selection**: bold, italic, headings, quotes and links in a small bubble above selected text.
- **An insert menu**: type `+` or `/` on an empty line for images, embeds (YouTube, Vimeo, Spotify), code blocks, section breaks, quotes and lists.
- **Markdown as you type**: `##`, `>`, `-`, `1.`, `---` and code fences.
- **Room settings**: text size, typewriter scrolling and focus dimming, kept per Writer in the browser.
- **Live sync and presence** through the Sanity App SDK. The room says when you're offline and keeps your words until you're back.
- **Publish from the room**: the slug is settled and the date stamped for you. If something blocks the publish, the room takes you straight to it.
- **Preview** opens the Post on your site in draft mode, exactly as readers will see it.

> **Status: pre-release.** This package is being extracted from the [Calm Editor template](https://github.com/mematthew123/calm-editor) and isn't on npm yet. The API below may change before 1.0. See [`docs/plugin-roadmap.md`](../../docs/plugin-roadmap.md).

## Requirements

The plugin runs inside Sanity Studio. It doesn't care what your website is built with.

| You need | Version | Why |
|---|---|---|
| Sanity Studio | `sanity` 6.22 or newer (v6) | The version the room is written and tested against. Older 6.x releases are being checked (see [Compatibility](#compatibility)). |
| React | 19.3.1 or newer | Required by `@portabletext/editor` 8. |
| `styled-components` | 6.1.18 or newer | The room's styling, as in the Studio itself. |
| Node.js | 22.12 or newer | Required by Sanity Studio v6 to run `sanity dev` and `sanity build`. |
| Studio auto-updates | **Off** | See [Turn off auto-updates](#3-turn-off-studio-auto-updates). |

**Do I need Next.js?** No. The room only needs a Studio. Next.js matters only if you turn on **Preview**, and even then any site can do it (see [Preview on your site](#preview-on-your-site)).

## Install

### 1. Add the package

From your Studio's folder:

```sh
npm install sanity-plugin-writing-room
```

npm (7+) and pnpm install peer dependencies automatically. The plugin shares two of them with Sanity, `@sanity/sdk-react` and `@portabletext/editor`, and needs the *same copy* Sanity uses. That happens by itself when your `sanity` version is in range. To check, run:

```sh
npm ls @sanity/sdk-react @portabletext/editor
```

Each package should appear at a single version. Yarn doesn't install peers for you; add `@sanity/sdk-react@^3.12.0` and `@portabletext/editor@^8.2.12` yourself.

### 2. Add the plugin

```ts
// sanity.config.ts
import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {writingRoom} from 'sanity-plugin-writing-room'

export default defineConfig({
  // …projectId, dataset, schema
  plugins: [structureTool(), writingRoom({types: ['post']})],
})
```

List the document types you write in: your own `post`, `article`, `caseStudy`… The room finds their title, body, slug and published date by itself (see [Document types](#document-types)), and only offers what each body can store.

No Post type yet? Register the starter one: `schema: {types: writingRoomSchemaTypes}` (see [Schema](#schema)).

### 3. Turn off Studio auto-updates

```ts
// sanity.cli.ts
import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  // …api
  deployment: {autoUpdates: false},
})
```

The room uses the App SDK (`@sanity/sdk-react`). An auto-updating Studio loads `sanity` from a CDN but bundles its own copy of the SDK, so the two never share a React context and the room crashes with "SanityInstance context not found". This only shows up in a **deployed** Studio, not in `sanity dev`. To upgrade later, bump `sanity` and redeploy.

### 4. Load the fonts (optional)

The room is set in Newsreader (prose) and Figtree (controls), falling back to Georgia and the system UI font. To get the intended look:

```sh
npm install @fontsource-variable/newsreader @fontsource-variable/figtree
```

```ts
// top of sanity.config.ts
import '@fontsource-variable/newsreader'
import '@fontsource-variable/figtree'
```

### 5. Open it

Run `sanity dev`. **Writing Room** appears in the Studio's navigation, and every Post has an **Open in Writing Room** action.

## What the plugin adds

- the **Writing Room** Tool at `/writing-room`, with a Lobby of recent writing;
- an **Open in Writing Room** action on the room's document types (Posts, by default);
- a wrapper around the built-in **Publish** on those types, so a document published from the form gets the same settled slug and published date as one published from the room.

## Document types

The room writes Posts by default. To write other kinds too, list their document types:

```ts
writingRoom({
  types: ['post', 'caseStudy'],
})
```

### Fields

The room reads each type's schema to find what it writes:

| | It looks for | If there's none |
|---|---|---|
| Title | `title`, else the field the type's preview shows as its title, else the first string field | The type is left out |
| Body | `body`, else `content`, else the first portable text field | The type is left out |
| Slug | `slug`, else the first slug field | No slug is settled on publish |
| Published date | `publishedAt`, else the first date field whose name contains "publish" | No date is stamped on publish |
| Cover image | `coverImage`, else `mainImage`, else the first image field | No "Add a cover image" nudge after a publish |

If it guesses wrong, name the field: `{type: 'article', fields: {body: 'content', title: 'headline'}}`. Anything else (excerpt, tags, a client name…) stays in the standard form under **Details**.

### The body

The editor is built from the body field's own type, so the room only offers what that type can store. A `blockContent` with headings, quotes, bullets, links and images gets exactly those: no code blocks, embeds or numbered lists in the Insert Menu, selection bubble or markdown shortcuts. Image description and caption inputs appear only when your image type has `alt` and `caption` fields.

The room's extra blocks (embeds, code blocks, section breaks) come with `writingRoomSchemaTypes`. Add `embed`, `codeBlock` or `sectionBreak` to your body type's `of` to offer them.

### Labels and URLs

The Lobby gets a **Start a new …** button and an **All …** link for each type, and Recent lists them together. The room names each type with its schema `title` ("Case Study", "Case Studies"). If the plural comes out wrong, set it yourself:

```ts
writingRoom({
  types: ['post', {type: 'news', title: 'News', pluralTitle: 'News'}],
})
```

| Option | Default | What it does |
|---|---|---|
| `types` | `['post']` | The document types the room writes, as names or `{type, title?, pluralTitle?, fields?}`. |
| `types[].title` | the schema type's `title` | What one is called: "Start a new Case Study". |
| `types[].pluralTitle` | `title` made plural | What several are called: "All Case Studies". |
| `types[].fields` | detected | `{title?, body?, slug?, publishedAt?, image?}`: field names, when the room guesses wrong. |

The first type is the default: its documents open at `/writing-room/<id>`, the others at `/writing-room/<type>/<id>`. A Studio with one type keeps short URLs, and links to it keep working if you add more types later, as long as it stays first.

If a type in `types` isn't in your schema, or has no title or body the room can find, the room leaves it out and says why in the browser console. Slugs are unique within a type, so a Post and a Case Study can both be `hello-world`.

## Schema

You don't need the plugin's schema if you already have a type to write in: the room works with yours. `writingRoomSchemaTypes` is a starter for Studios that don't: a `post` with a `body` that has everything the room can do (images with descriptions and captions, embeds, code blocks, section breaks). Each is also exported on its own (`post`, `body`, `embed`, `codeBlock`, `sectionBreak`) if you'd rather compose them.

The plugin doesn't register these types for you, on purpose. `post` and `body` are common names, and a clash would stop your Studio from starting, so you add them where you can see them.

Only Prose (title, body, and alt text on body images) should *block* a publish, because the Writer can't fix anything else from inside the room. Publishing from the room is a real publish: webhooks and Functions that listen for it run as usual.

## Preview on your site

Preview opens the document on your site in draft mode, unpublished changes included. It's off until you give it your site's origin:

```ts
writingRoom({
  preview: {
    origin: 'https://example.com',
    pathname: (slug) => `/blog/${slug}`, // default: /posts/<slug>
  },
})
```

| Option | Default | What it does |
|---|---|---|
| `preview.origin` | — | Your site's origin. Setting `preview` turns on the room's Preview button. |
| `preview.enablePath` | `/api/draft-mode/enable` | The route that checks the preview secret and turns on draft mode. |
| `preview.pathname` | `/posts/<slug>` for `post`, `/<type>/<slug>` for other types | `(slug, type) => path`: where a document is read on your site. |

With more than one type, use the second argument:

```ts
pathname: (slug, type) => (type === 'caseStudy' ? `/case-studies/${slug}` : `/blog/${slug}`)
```

The room creates a one-hour preview secret and opens `<origin><enablePath>?sanity-preview-secret=…&sanity-preview-pathname=…`. Your site needs a route there that validates the secret and redirects:

- **Next.js** (App Router): use `next-sanity`.

  ```ts
  // app/api/draft-mode/enable/route.ts
  import {defineEnableDraftMode} from 'next-sanity/draft-mode'
  import {client} from '@/sanity/client'

  export const {GET} = defineEnableDraftMode({
    client: client.withConfig({token: process.env.SANITY_API_READ_TOKEN}),
  })
  ```

- **Anything else** (Astro, Nuxt, SvelteKit, Remix…): call `validatePreviewUrl(client, request.url)` from `@sanity/preview-url-secret`, turn on your framework's draft or preview mode, and redirect to the `redirectTo` it returns.

Either way the site needs a Viewer token to check the secret, and its origin must be a CORS origin of your Sanity project.

## Compatibility

`npm run smoke` (in this package) packs the plugin, installs it with npm into a brand-new Studio and checks that:

1. it installs with no peer-dependency conflicts,
2. there's exactly one copy of `@sanity/sdk-react`, `@sanity/sdk`, `@portabletext/editor`, `react` and `styled-components`,
3. the README's `sanity.config.ts` type-checks against the published types,
4. `sanity build` bundles the Studio.

```sh
pnpm --filter sanity-plugin-writing-room smoke              # latest sanity
pnpm --filter sanity-plugin-writing-room smoke 6.12.0 --loose  # an older one, ignoring the declared range
```

It can't open the room itself, because that needs a logged-in Studio. Check that by hand.

| `sanity` | Smoke test | Notes |
|---|---|---|
| 6.22.0 | ✅ passes | Declared minimum. Used day to day in the template. |
| 6.12.0 – 6.21.x | ✅ passes with `--loose` | Not yet used for real writing, so not in the declared range. |
| ≤ 6.11.x | ❌ fails | Ships App SDK v2 and `@portabletext/editor` 7, so the room gets a second copy of each. |

Results from November 2026.

## Develop

This package lives in the Calm Editor monorepo. The template Studio (`apps/studio`) uses it straight from `src`, so `pnpm dev` at the repo root picks up changes without a build.

```sh
pnpm --filter sanity-plugin-writing-room test       # Vitest
pnpm --filter sanity-plugin-writing-room typecheck
pnpm --filter sanity-plugin-writing-room build      # tsdown → dist/
pnpm --filter sanity-plugin-writing-room smoke      # install into a fresh Studio
```

`@calm/content` and `@calm/tokens` are private workspace packages, so they're dev dependencies and get bundled into `dist`. `publishConfig` swaps `exports` from `src` to `dist` when the package is packed or published.

## License

[MIT](LICENSE)
