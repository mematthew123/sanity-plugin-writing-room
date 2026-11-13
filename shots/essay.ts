/**
 * The Post in every capture on writingroom.studio. It is the first thing a visitor reads about
 * the room, so it is real writing: edit it here, and run `pnpm shots` again.
 */

let key = 0
const next = () => `k${key++}`

type Mark = 'strong' | 'em'
type Span = string | {text: string; marks: Mark[]}

function block(style: 'normal' | 'h2' | 'blockquote', ...spans: Span[]) {
  return {
    _type: 'block',
    _key: next(),
    style,
    markDefs: [],
    children: spans.map((span) => ({
      _type: 'span',
      _key: next(),
      text: typeof span === 'string' ? span : span.text,
      marks: typeof span === 'string' ? [] : span.marks,
    })),
  }
}

export const essay = {
  title: 'A form is not a page',
  slug: 'a-form-is-not-a-page',
  excerpt:
    'Forms ask their questions all at once. Writing answers them one at a time. On the difference, and a room built around it.',
  tags: ['writing', 'tools', 'sanity'],
  coverAlt: 'Morning light across a bare wall above a desk.',
  imageAlt: 'An empty desk under a window, in warm light.',
  imageCaption: 'A desk, before the first sentence.',
  /** The words the selection capture selects. They must appear once, and fit on one line. */
  selected: 'the next sentence',
}

/** The body, given the asset for its one image. */
export function essayBody(imageAssetId: string) {
  return [
    block(
      'normal',
      'Most of what I publish starts in a content management system, and most of those systems hand me a form. A box for the title, a box for the slug, a box for the excerpt and, somewhere below them, a box for the writing itself.',
    ),
    block(
      'normal',
      'Forms are good at what they are for. They keep a thousand articles consistent, and they make sure nobody forgets to describe an image. But a form asks its questions all at once, and writing answers them one at a time.',
    ),
    block('h2', 'What a page does'),
    block(
      'normal',
      'A page asks for one thing: the next sentence. It has no opinion yet about tags. It does not show a publish button to someone who is still deciding what they think. The best tools I have used for writing were mostly blank, and the blankness was ',
      {text: 'the feature', marks: ['em']},
      '.',
    ),
    block('blockquote', 'The interface should be there when you look for it, and gone when you don’t.'),
    block(
      'normal',
      'That is the whole idea behind this room. The title and the body are on the page. Everything else is one click away, and stays out of sight until it is asked for.',
    ),
    {
      _type: 'image',
      _key: next(),
      asset: {_type: 'reference', _ref: imageAssetId},
      alt: essay.imageAlt,
      caption: essay.imageCaption,
    },
    block('h2', 'What stays'),
    block(
      'normal',
      'Nothing about the content changes. It is the same document, in the same Studio, with the same fields. The slug still has to be right, and the cover image still needs a description. Those questions wait until the writing is done, which is when I can answer them.',
    ),
    {_type: 'sectionBreak', _key: next(), kind: 'break'},
    block('normal', 'I wrote this in the room. I looked for the controls twice.'),
  ]
}

/** A stand-in photograph, drawn in the room's own colours, until there is a real one. */
export const pictureHtml = `
<body style="margin:0">
  <div style="width:1600px;height:1000px;position:relative;overflow:hidden;
    background:linear-gradient(168deg,#EFE3D2 0%,#E6CDB3 46%,#C98E6B 100%)">
    <div style="position:absolute;inset:0;background:
      linear-gradient(104deg,transparent 0 22%,rgba(255,244,226,.55) 22% 41%,transparent 41% 47%,rgba(255,244,226,.4) 47% 61%,transparent 61%)"></div>
    <div style="position:absolute;left:0;right:0;bottom:0;height:300px;
      background:linear-gradient(180deg,#7A4630 0%,#4B2C20 100%)"></div>
    <div style="position:absolute;left:0;right:0;bottom:300px;height:10px;background:rgba(46,40,35,.28)"></div>
    <div style="position:absolute;left:330px;bottom:300px;width:230px;height:16px;background:#F7EFE3;
      box-shadow:0 -14px 0 #E9DCC9,0 -28px 0 #F7EFE3"></div>
    <div style="position:absolute;left:1080px;bottom:300px;width:54px;height:150px;border-radius:6px 6px 2px 2px;
      background:#2E2823"></div>
  </div>
</body>`
