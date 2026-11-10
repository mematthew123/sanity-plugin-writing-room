# sanity-plugin-writing-room

A calm, full-screen place to write long-form content inside Sanity Studio: Posts, articles, case studies, whatever your Studio writes.

Most Studios put writing in a form: panes, field labels and a toolbar around every sentence. The Writing Room is a Studio Tool with its own route that shows only a document's title and body, and gets out of the way while you type. Everything else (slug, excerpt, cover image, tags) stays in the standard form, one click away. It works with the document types you already have.

- **The Lobby**: start something new or pick up recent work.
- **Controls that recede**: Leave, Details, Preview, Publish and save state fade after a few keystrokes and return when you pause.
- **Formatting on selection**: bold, italic, headings, quotes and links in a small bubble above selected text.
- **An insert menu**: type `+` or `/` on an empty line for images, embeds (YouTube, Vimeo, Spotify), code blocks, section breaks, quotes and lists.
- **Markdown as you type**: `##`, `>`, `-`, `1.`, `---` and code fences.
- **Room settings**: text size, typewriter scrolling and focus dimming, kept per Writer in the browser (no setup).
- **Live sync and presence** through the Sanity App SDK. The room says when you're offline and keeps your words until you're back.
- **Publish from the room**: the slug is settled and the date stamped for you. If something blocks the publish, the room takes you straight to it.
- **Preview** opens the document on your site in draft mode, exactly as readers will see it.

> **Status: 0.x.** The API may change before 1.0; breaking changes are listed in the [changelog](https://github.com/mematthew123/calm-editor/blob/main/packages/writing-room/CHANGELOG.md). The plugin comes from the [Calm Editor template](https://github.com/mematthew123/calm-editor), which uses it. See the [roadmap](https://github.com/mematthew123/calm-editor/blob/main/docs/plugin-roadmap.md).

## Requirements

The plugin runs inside Sanity Studio. It doesn't care what your website is built with.

| You need | Version | Why |
|---|---|---|
| Sanity Studio | `sanity` 6.22 or newer (v6) | The version the room is written and tested against. Older 6.x releases are being checked (see [Compatibility](#compatibility)). |
| React | 19.3.1 or newer | Required by `@portabletext/editor` 8. |
| `styled-components` | 6.1.18 or newer | The room's styling, as in the Studio itself. |
| Node.js | 22.12 or newer | Required by Sanity Studio v6 to run `sanity dev` and `sanity build`. |
| Studio auto-updates | **Off** | See [Why auto-updates off?](#install). |

**Do I need Next.js?** No. The room only needs a Studio. Next.js matters only if you turn on **Preview**, and even then any site can do it (see [Preview on your site](#preview-on-your-site)).

## Install

Three steps, from your Studio's folder.

**1. Add the package.**

```sh
npm install sanity-plugin-writing-room
```

**2. Add the plugin, with the document types you write in.**

```ts
// sanity.config.ts
import {writingRoom} from 'sanity-plugin-writing-room'

export default defineConfig({
  // …
  plugins: [structureTool(), writingRoom({types: ['post']})],
})
```

**3. Turn off Studio auto-updates.**

```ts
// sanity.cli.ts
export default defineCliConfig({
  // …
  deployment: {autoUpdates: false},
})
```

That's all. Run `sanity dev`: **Writing Room** appears in the Studio's navigation, and each of those documents gets an **Open in Writing Room** action.

**Which types?** Your own `post`, `article`, `caseStudy`… The room finds each one's title, body, slug and published date by itself (see [Document types](#document-types)) and only offers what its body can store. No Post type yet? Register the starter one: `schema: {types: writingRoomSchemaTypes}` (see [Schema](#schema)).

**Why auto-updates off?** The room uses Sanity's App SDK (`@sanity/sdk-react`). An auto-updating Studio loads `sanity` from a CDN but bundles its own copy of the SDK, so the two never share a React context and the room can't start. This only shows up in a **deployed** Studio, not in `sanity dev`. To upgrade later, bump `sanity` and deploy again.

## Look and feel

The room brings its own look, and none of it reaches the rest of your Studio:

- **Fonts.** Newsreader (prose, with a true italic) and Figtree (controls) come with the plugin, Latin and Latin Extended, and load the first time the room opens. Nothing to install. Other scripts fall back to Georgia and the system UI font.
- **Colours.** The room's paper, warm neutrals and clay accent apply inside the room only. To change them, pass the ones you want per scheme; the rest keep their defaults:

  ```ts
  writingRoom({
    types: ['post'],
    colors: {light: {accent: '#2F6FA8'}, dark: {accent: '#8DB8E0'}},
  })
  ```

  The colours are `paper`, `surface`, `rule`, `ink`, `inkMuted`, `inkFaint`, `accent`, `onAccent`, `selection`, `caution` and `floatingShadow`. Keep text readable against `paper` and `surface`; the defaults meet WCAG AA.

### A matching Studio theme (optional)

To give the rest of the Studio the room's colours and Figtree, so moving in and out of the room isn't a jolt, use the theme. It needs `@sanity/themer`:

```sh
npm install @sanity/themer
```

```ts
import {writingRoomTheme} from 'sanity-plugin-writing-room/theme'

export default defineConfig({
  // …
  theme: writingRoomTheme,
})
```

If you changed the room's colours, build the theme from the same ones: `theme: createWritingRoomTheme({colors})`.

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

To offer the room's own blocks (YouTube/Vimeo/Spotify embeds, code blocks, section breaks), add them to your body type. The plugin registers them for you, under prefixed names that can't clash with yours:

```ts
import {writingRoomBlocks} from 'sanity-plugin-writing-room'

defineType({
  name: 'blockContent',
  type: 'array',
  of: [{type: 'block'}, {type: 'image'}, ...writingRoomBlocks],
})
```

Your site then renders them as `writingRoomEmbed`, `writingRoomCodeBlock` and `writingRoomSectionBreak`. (The starter `writingRoomSchemaTypes` uses the original names, `embed`, `codeBlock` and `sectionBreak`; the room handles both.)

Blocks of your own that the room doesn't know (a `callout`, a product card…) keep their place in the text as a quiet placeholder: the Writer can move or delete them, and **Edit in Details** opens that block in the standard form.

### Labels and URLs

The Lobby gets a **Start a new …** button and an **All …** link for each type, and Recent lists them together. **All …** opens the type's most recent document in Structure, wherever your Structure keeps that list. The room names each type with its schema `title` ("Case Study", "Case Studies"). If the plural comes out wrong, set it yourself:

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

## Troubleshooting

**"The Writing Room can't start in this Studio yet."** The room and the Studio are using different copies of Sanity's App SDK. On a deployed Studio, turn off auto-updates ([Install](#install), step 3) and deploy again. In `sanity dev`, run `npm ls @sanity/sdk-react`: it should appear at a single version. If you've linked the plugin (`npm link`, `file:`, a workspace) instead of installing it, add `sanity`, `react`, `react-dom`, `styled-components`, `@sanity/sdk-react` and `@portabletext/editor` to Vite's `resolve.dedupe` in `sanity.cli.ts`.

**Yarn, or two copies of the SDK.** npm (7+) and pnpm install the plugin's peer dependencies for you, and share `@sanity/sdk-react` and `@portabletext/editor` with Sanity when your `sanity` version is in range. Yarn doesn't install peers: add `@sanity/sdk-react@^3.12.0` and `@portabletext/editor@^8.2.12` yourself. To check, run `npm ls @sanity/sdk-react @portabletext/editor`: each should appear at a single version.

**A type is missing from the Lobby.** Open the browser console: the room says why it left a type out (not in the schema, or no title or body it could find). Name the field with `fields` if it guessed wrong.

## Compatibility

`npm run smoke` (in this package) packs the plugin, installs it with npm into a brand-new Studio and checks that:

1. it installs with no peer-dependency conflicts,
2. there's exactly one copy of `@sanity/sdk-react`, `@sanity/sdk`, `@portabletext/editor`, `react` and `styled-components`, and of every `@portabletext/*` package,
3. a `sanity.config.ts` using the plugin and its theme type-checks against the published types,
4. `sanity build` bundles the Studio with exactly one copy of the App SDK,
5. with `--embedded`, the same Studio embedded in a Next.js App Router app (`next-sanity`'s `NextStudio`) builds too, again with one App SDK in the browser bundle.

```sh
pnpm --filter sanity-plugin-writing-room smoke                     # latest sanity
pnpm --filter sanity-plugin-writing-room smoke latest --embedded   # …and embedded in Next.js
pnpm --filter sanity-plugin-writing-room smoke 6.12.0 --loose      # an older one, ignoring the declared range
```

CI runs it on every pull request against the declared minimum (6.22.0) and the latest release, embedded too.

It can't open the room itself, because that needs a logged-in Studio. Check that by hand.

**Embedding the Studio in Next.js:** put `'use client'` at the top of `sanity.config.ts`, as Sanity's guide for the App Router says; without it, Next tries to bundle the whole Studio for the server.

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

[MIT](https://github.com/mematthew123/calm-editor/blob/main/packages/writing-room/LICENSE)
