# sanity-plugin-writing-room

A calm, full-screen place to write long-form content inside Sanity Studio: Posts, articles, case studies, whatever your Studio writes.

Most Studios put writing in a form: panes, field labels and a toolbar around every sentence. The Writing Room is a Studio Tool with its own route that shows only a document's title and body, and gets out of the way while you type. Everything else (slug, excerpt, cover image, tags, any field of your own) is under **Details**: one click swaps the body for those fields, without leaving the room. It works with the document types you already have.

- **The Lobby**: a doorway, not a document browser. Continue the piece you were last in, start something new, or pick from a few recent ones. The Studio's navbar stays above it, and Structure is one link away for everything else.
- **Controls that recede**: Leave on one side; status, Details, Preview and Publish on the other. They fade after a few keystrokes and return when you pause. The word count sits at the foot of the page, and anything the room needs to tell you appears there too.
- **Formatting on selection**: bold, italic, headings, quotes and links in a small bubble above selected text.
- **An insert menu**: click the `+` beside an empty line, or type `/`, for images, embeds (YouTube, Vimeo, Spotify), code blocks, section breaks, quotes and lists.
- **Markdown as you type**: `##`, `>`, `-`, `1.`, `---` and code fences.
- **Room settings**: one `Aa` menu for text size, typewriter scrolling and focus dimming (kept per Writer in the browser, no setup), dark mode and fullscreen.
- **Any screen**: on a phone or a narrow window the controls keep to Leave, `Aa` and Publish, and the rest moves into the `Aa` menu.
- **Live sync and presence** through the Sanity App SDK. The room says when you're offline and keeps your words until you're back.
- **Publish from the room**: the slug is settled and the date stamped for you. If something blocks the publish, the room takes you straight to it; if nothing does, it shows where the document will go live and asks once. Afterwards, a link to the live page (when `preview` says where your site is).
- **Preview** opens the document on your site in draft mode, exactly as readers will see it.

> **Status: 0.x.** The API may change before 1.0; breaking changes are listed in the [changelog](https://github.com/mematthew123/sanity-plugin-writing-room/blob/main/CHANGELOG.md). What's next is in the [roadmap](https://github.com/mematthew123/sanity-plugin-writing-room/blob/main/ROADMAP.md).

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
- **Colours.** The room's paper, warm neutrals and clay accent apply inside the room only. The accent (links, the caret, focus rings, Publish) is the one colour you can change, to match your brand:

  ```ts
  writingRoom({
    types: ['post'],
    accent: '#2F6FA8',
  })
  ```

  Give one hex colour and the room uses it in light and dark, adjusting it where it has to so it stays readable on the room's paper (WCAG AA), and works out the selection highlight and the text on Publish from it. To choose each yourself: `accent: {light: '#2F6FA8', dark: '#8DB8E0'}`.

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

If you changed the room's accent, build the theme from the same one: `theme: createWritingRoomTheme({accent: '#2F6FA8'})`.

## What the plugin adds

- the **Writing Room** Tool at `/writing-room`, with a Lobby to continue or start from;
- an **Open in Writing Room** action on the room's document types (Posts, by default). Leave then takes you back to that document's form; from the Lobby, back to the Lobby;
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

If it guesses wrong, name the field: `{type: 'article', fields: {body: 'content', title: 'headline'}}`. Every other field (excerpt, tags, a client name…) shows up under **Details**, with nothing to configure.

### Details

**Details** in the room's controls swaps the body for the document's other fields, on one page in the order your schema gives them. The title stays where it is, and the arrow or Esc goes back to the writing.

- **Simple fields get the room's own inputs**: strings, text, numbers, booleans, dates, slugs and tag lists.
- **Everything else is Sanity's own input**, looking as it does in the rest of your Studio: references, images, files, arrays of objects, and lists of choices. With the [matching theme](#a-matching-studio-theme-optional) they sit closer to the room's look.
- **Your custom inputs are used as they are.** A field with its own `components.input` or `components.field` is never replaced.
- **List the Writing Room last in `plugins` if another plugin wraps every input.** For simple fields the room's inputs take the place of Sanity's, which ends Sanity's chain of input components there. A plugin listed before the Writing Room still wraps the room's inputs in Details; one listed after it, and a `form.components.input` in your own Studio config, does not. Everything still appears in the Structure form.
- **Your schema's rules apply**: `hidden`, `readOnly` and validation behave as they do in the standard form. Field groups are not shown as tabs; fieldsets are kept.
- A type with only a title and a body has no Details button.

Details are saved as you type, like the writing. If a required field blocks a publish, the room opens Details at that field.

If the Details view can't be shown in your Studio, the room says so and offers **Open in Structure** instead.

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

Blocks of your own that the room doesn't know (a `callout`, a product card…) keep their place in the text as a quiet placeholder: the Writer can move or delete them, and **Edit in Structure** opens that block in the standard form.

### Labels and URLs

The Lobby's **New** button starts a document of your type ("New Post"); with several types it asks which. Recent writing lists them together. The room names each type with its schema `title` ("Case Study"). If a name comes out wrong, set it yourself:

```ts
writingRoom({
  types: ['post', {type: 'news', title: 'News', pluralTitle: 'News'}],
})
```

| Option | Default | What it does |
|---|---|---|
| `types` | `['post']` | The document types the room writes, as names or `{type, title?, pluralTitle?, fields?}`. |
| `types[].title` | the schema type's `title` | What one is called: "New Case Study". |
| `types[].pluralTitle` | `title` made plural | What several are called: "Case Studies". |
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
pnpm smoke                      # latest sanity
pnpm smoke latest --embedded   # …and embedded in Next.js
pnpm smoke 6.12.0 --loose      # an older one, ignoring the declared range
```

CI runs it on every pull request against the declared minimum (6.22.0) and the latest release, embedded too.

It can't open the room itself, because that needs a logged-in Studio. The browser tests under [Develop](#develop) do that.

**Embedding the Studio in Next.js:** put `'use client'` at the top of `sanity.config.ts`, as Sanity's guide for the App Router says; without it, Next tries to bundle the whole Studio for the server.

| `sanity` | Smoke test | Notes |
|---|---|---|
| 6.22.0 | ✅ passes | Declared minimum. Used day to day. |
| 6.12.0 – 6.21.x | ✅ passes with `--loose` | Not yet used for real writing, so not in the declared range. |
| ≤ 6.11.x | ❌ fails | Ships App SDK v2 and `@portabletext/editor` 7, so the room gets a second copy of each. |

Results from November 2026.

## Develop

```sh
pnpm install
cp .env.example .env.local   # your project ID and dataset; once
pnpm dev         # a Studio at http://localhost:3333 using the plugin from src/
pnpm test        # Vitest
pnpm typecheck
pnpm lint
pnpm build       # tsdown → dist/
pnpm smoke       # pack, install into a fresh Studio, type-check and build it
pnpm e2e         # Playwright: the room in a real, logged-in Studio
```

### Browser tests

`pnpm e2e` opens the dev Studio in Chromium and writes in the room: typing, Details, publishing. It needs `SANITY_STUDIO_DATASET` set in `.env.local` (the tests won't fall back to `production` on their own) and one more line:

```sh
SANITY_E2E_TOKEN=   # an Editor token for the project (sanity.io/manage → API → Tokens)
```

and the browser, once: `pnpm exec playwright install chromium`.

- **It writes real documents.** Each test makes its own Post, with an id starting `e2e-`, in the dataset from `.env.local`, and deletes it afterwards, published copy included. Anything an interrupted run leaves behind is removed at the start of the next run, once it's an hour old. Use a dataset you don't mind testing in.
- **Publishing is real too**: a test that publishes will fire the dataset's webhooks.
- It starts `pnpm dev` itself, or uses the one already running on port 3333.
- Without the token every test is skipped, with a line saying what to set.
- `pnpm e2e:ui` opens Playwright's own runner, to watch a test or step through it. After a failure, `pnpm exec playwright show-report` has the trace.

The dev Studio has a second kind of writing, **Field Note** (`e2e/field-note.ts`), for the tests: it has a number, a switch, a date, a list of choices and a required Details field, which the starter Post doesn't. The published plugin doesn't include it.

Tests live in `e2e/`, named `*.e2e.ts` (`*.phone.e2e.ts` for the ones that run at phone width only). `e2e/room.ts` knows where things are in the room; `e2e/fixtures.ts` signs in and makes each test its Post.

In CI they run on pushes and on pull requests from this repository, when the `SANITY_E2E_PROJECT_ID`, `SANITY_E2E_DATASET` and `SANITY_E2E_TOKEN` secrets are set; without them the job passes without running anything. The project needs `http://localhost:3333` as a CORS origin.

### Captures for the site

`pnpm shots` photographs the room for [writingroom.studio](https://writingroom.studio), in dark and light: stills as PNG and one short loop as MP4 (which needs `ffmpeg`). It uses the same `.env.local` and dev Studio as the browser tests, seeds the essay in `shots/essay.ts` as a draft Post (ids starting `shots-`), and removes it afterwards. Nothing is published.

```sh
pnpm shots                                               # into shots/out, which git ignores
pnpm shots --out ../writingroom-studio/src/assets/shots  # straight into the site
pnpm shots --project dark -g details                     # one capture, one scheme
```

The publish capture shows `demo.writingroom.studio` as the place the Post goes live; a dev Studio that was already running keeps its own `SANITY_STUDIO_PREVIEW_ORIGIN`, so stop it first.

`publishConfig` swaps `exports` from `src` to `dist` when the package is packed or published, so always publish with `pnpm publish`. Releases are made with Changesets; see [RELEASING.md](https://github.com/mematthew123/sanity-plugin-writing-room/blob/main/RELEASING.md).

`pnpm dev` runs the dev Studio in `sanity.config.ts`: the starter schema, `writingRoom({types: ['post']})` and the theme, with the plugin imported straight from `src/`, so edits reload as you save. It writes real documents, so point `.env.local` at a project and dataset you don't mind testing in, with `http://localhost:3333` as a CORS origin. Set `SANITY_STUDIO_PREVIEW_ORIGIN` to try Preview against a site with a draft-mode route. The dev Studio isn't part of the package, and isn't meant to be built (`sanity build` would write over `dist/`).

To try a change in a Studio of your own, install a packed tarball (`pnpm pack`, then `npm install ./sanity-plugin-writing-room-*.tgz`) rather than linking the folder: a linked plugin resolves its own copy of Sanity's App SDK, and the room can't start (see [Troubleshooting](#troubleshooting)).

How the room should look, behave and speak is written down in [DESIGN.md](https://github.com/mematthew123/sanity-plugin-writing-room/blob/main/DESIGN.md); read it before changing the interface. A test keeps its token values in step with `src/tokens.ts`.

`src/tokens.ts` and `src/embed.ts` are copies of the design tokens and embed parsing in the Calm Editor template (private), which shares them with its Reading Site. Keep the two in step.

## License

[MIT](https://github.com/mematthew123/sanity-plugin-writing-room/blob/main/LICENSE)
