import {createSchema} from 'sanity'
import {describe, expect, it} from 'vitest'
import {type SortingResponse} from '../../sorting/contract'
import {type WritingFields} from '../fields'
import {applySorting, contentOf, sortedMessage} from './apply'
import {sortingMarks} from './marks'
import {isEmptyValue, labelQuery, sortableFields} from './sortable-fields'
import {bodyIsEmpty, isWholePiece, unmarked, writtenBlocks} from './whole-piece'

const writing: WritingFields = {title: 'title', body: 'body', slug: 'slug', publishedAt: 'publishedAt', image: 'coverImage'}

const block = (key: string, text: string) => ({_type: 'block', _key: key, children: [{_type: 'span', text}]})
const words = (count: number) => Array.from({length: count}, () => 'word').join(' ')

const schema = createSchema({
  name: 'test',
  types: [
    {name: 'author', type: 'document', fields: [{name: 'name', type: 'string'}], preview: {select: {title: 'name'}}},
    {name: 'category', type: 'document', fields: [{name: 'title', type: 'string'}]},
    {
      name: 'article',
      type: 'document',
      fields: [
        {name: 'title', type: 'string'},
        {name: 'body', type: 'array', of: [{type: 'block'}]},
        {name: 'slug', type: 'slug'},
        {name: 'excerpt', title: 'Excerpt', type: 'text', description: 'A sentence or two.'},
        {name: 'coverImage', type: 'image'},
        {name: 'publishedAt', type: 'datetime'},
        {name: 'updatedOn', type: 'date'},
        {name: 'featured', type: 'boolean'},
        {name: 'readingTime', type: 'number'},
        {name: 'website', type: 'url'},
        {name: 'seo', type: 'object', fields: [{name: 'description', type: 'string'}]},
        {name: 'secret', type: 'string', hidden: true},
        {name: 'reviewed', type: 'string', readOnly: () => true},
        {name: 'author', title: 'Author', type: 'reference', to: [{type: 'author'}]},
        {name: 'editor', type: 'reference', to: [{type: 'author'}], options: {filter: 'defined(name)'}},
        {name: 'categories', type: 'array', of: [{type: 'reference', to: [{type: 'category'}]}]},
        {name: 'tags', title: 'Tags', type: 'array', of: [{type: 'string'}], options: {layout: 'tags'}},
        {name: 'aliases', type: 'array', of: [{type: 'string'}]},
        {name: 'layout', type: 'string', options: {list: [{title: 'Standard', value: 'standard'}, 'wide']}},
        {name: 'topics', type: 'array', of: [{type: 'string'}], options: {list: ['news', 'opinion']}},
      ],
    },
  ],
})
const article = schema.get('article')

describe('a whole-piece paste', () => {
  it('needs three written blocks and about 150 words', () => {
    expect(isWholePiece([block('a', words(60)), block('b', words(60)), block('c', words(60))])).toBe(true)
    expect(isWholePiece([block('a', words(100)), block('b', words(100))])).toBe(false)
    expect(isWholePiece([block('a', words(20)), block('b', words(20)), block('c', words(20))])).toBe(false)
    expect(isWholePiece(undefined)).toBe(false)
  })

  it('counts nothing for empty blocks, which Google Docs pastes many of', () => {
    const body = [block('a', words(160)), block('b', ''), block('c', '  '), block('d', 'One more.')]
    expect(writtenBlocks(body).map((entry) => entry.id)).toEqual(['a', 'd'])
    expect(isWholePiece(body)).toBe(false)
  })

  it('knows an empty body', () => {
    expect(bodyIsEmpty(undefined)).toBe(true)
    expect(bodyIsEmpty([block('a', '')])).toBe(true)
    expect(bodyIsEmpty([block('a', 'Hello')])).toBe(false)
    expect(bodyIsEmpty([{_type: 'image', _key: 'i'}])).toBe(false)
  })
})

describe('the fields Sorting may fill', () => {
  const names = (document: Record<string, unknown> = {}) => sortableFields(article, document, writing).map((entry) => entry.field.name)

  it('takes text, picks and tags, and leaves the rest alone', () => {
    expect(names()).toEqual(['excerpt', 'author', 'categories', 'tags', 'layout', 'topics'])
  })

  it('says what each is and how it is stored', () => {
    const byName = Object.fromEntries(sortableFields(article, {}, writing).map((entry) => [entry.field.name, entry]))
    expect(byName.excerpt).toEqual({field: {kind: 'text', name: 'excerpt', title: 'Excerpt', description: 'A sentence or two.'}, store: 'string'})
    expect(byName.author).toMatchObject({field: {kind: 'pick', many: false, options: []}, store: 'reference', from: ['author']})
    expect(byName.categories).toMatchObject({field: {kind: 'pick', many: true}, store: 'references', from: ['category']})
    expect(byName.tags).toMatchObject({field: {kind: 'list'}, store: 'strings'})
    expect(byName.layout.field).toMatchObject({kind: 'pick', many: false, options: [{id: 'standard', label: 'Standard'}, {id: 'wide', label: 'wide'}]})
    expect(byName.topics).toMatchObject({field: {kind: 'pick', many: true}, store: 'strings'})
  })

  it('skips a field that already has something in it', () => {
    const filled = names({excerpt: 'Mine.', tags: ['one'], author: {_type: 'reference', _ref: 'a1'}})
    expect(filled).toEqual(['categories', 'layout', 'topics'])
    expect(names({excerpt: '   ', tags: []})).toContain('excerpt')
  })

  it('knows empty from filled', () => {
    expect([undefined, null, '', ' ', [], {_type: 'slug'}].every(isEmptyValue)).toBe(true)
    expect([0, false, 'a', ['a'], {_type: 'reference', _ref: 'x'}].some(isEmptyValue)).toBe(false)
  })

  it('finds what documents are called', () => {
    expect(labelQuery(['author', 'category'], (name) => schema.get(name))).toBe(
      'select(_type == "author" => coalesce(name, title), _type == "category" => coalesce(title, name))',
    )
  })

  it('prefers a nested preview title to the fallback fields', () => {
    const nested = createSchema({
      name: 'nested',
      types: [
        {
          name: 'person',
          type: 'document',
          fields: [
            {name: 'profile', type: 'object', fields: [{name: 'displayName', type: 'string'}]},
          ],
          preview: {select: {title: 'profile.displayName'}},
        },
      ],
    })
    expect(labelQuery(['person'], (name) => nested.get(name))).toBe(
      'select(_type == "person" => coalesce(profile.displayName, title, name))',
    )
  })

  it.each([
    '.name',
    'profile.',
    'profile..name',
    'profile.1name',
    'profile.display-name',
    'profile[0].name',
    'profile. name',
  ])(
    'falls back when the preview title contains an invalid path: %s',
    (title) => {
      const author = {...schema.get('author')!, preview: {select: {title}}}
      expect(labelQuery(['author'], () => author)).toBe(
        'select(_type == "author" => coalesce(title, name))',
      )
    },
  )

  it('keeps the name a reference is stored under', () => {
    const named = createSchema({
      name: 'named',
      types: [
        {name: 'author', type: 'document', fields: [{name: 'name', type: 'string'}]},
        {name: 'category', type: 'document', fields: [{name: 'title', type: 'string'}]},
        {name: 'authorRef', type: 'reference', to: [{type: 'author'}]},
        {
          name: 'article',
          type: 'document',
          fields: [
            {name: 'author', type: 'authorRef'},
            {
              name: 'related',
              type: 'array',
              of: [
                {name: 'byline', type: 'reference', to: [{type: 'author'}]},
                {type: 'reference', to: [{type: 'category'}]},
              ],
            },
          ],
        },
      ],
    })
    const fields = sortableFields(named.get('article'), {}, writing)
    const byName = Object.fromEntries(fields.map((entry) => [entry.field.name, entry]))
    expect(byName.author!.storedAs).toEqual({author: 'authorRef'})
    expect(byName.related!.storedAs).toEqual({author: 'byline', category: 'reference'})

    const answered = fields.map((entry) =>
      entry.field.kind === 'pick'
        ? {
            ...entry,
            field: {...entry.field, options: [{id: 'a1', label: 'Sam'}, {id: 'c1', label: 'Travel'}]},
            answerTypes: {a1: 'author', c1: 'category'},
          }
        : entry,
    )
    let key = 0
    const sorted = applySorting({
      document: {},
      writing,
      sortable: answered,
      response: {
        version: 1,
        headline: null,
        placed: [],
        picked: [
          {field: 'author', options: ['a1'], kind: 'judged', line: null, confidence: 1},
          {field: 'related', options: ['a1', 'c1'], kind: 'judged', line: null, confidence: 1},
        ],
        listed: [],
      },
      isPublished: false,
      keyGenerator: () => `key${++key}`,
    })
    expect(sorted.next.author).toEqual({_type: 'authorRef', _ref: 'a1'})
    expect(sorted.next.related).toEqual([
      {_type: 'byline', _ref: 'a1', _key: 'key1'},
      {_type: 'reference', _ref: 'c1', _key: 'key2'},
    ])
  })
})

describe('applying what the route answered', () => {
  const body = [
    block('k1', '# A Week in Lisbon'),
    block('k2', 'By Sam Okafor'),
    block('k3', 'Seven days and one very steep tram.'),
    block('k4', 'Tags: portugal, city breaks'),
    block('k5', 'I arrived in Lisbon on a Sunday evening.'),
  ]
  const sortable = sortableFields(article, {}, writing).map((entry) =>
    entry.field.name === 'author' && entry.field.kind === 'pick'
      ? {...entry, field: {...entry.field, options: [{id: 'author-sam', label: 'Sam Okafor'}]}}
      : entry.field.name === 'categories' && entry.field.kind === 'pick'
        ? {...entry, field: {...entry.field, options: [{id: 'cat-travel', label: 'Travel'}]}}
        : entry,
  )
  const response: SortingResponse = {
    version: 1,
    headline: {block: 'k1', confidence: 1},
    placed: [{field: 'excerpt', block: 'k3', confidence: 0.9}],
    picked: [
      {field: 'author', options: ['author-sam'], kind: 'stated', line: 'k2', confidence: 1},
      {field: 'categories', options: ['cat-travel'], kind: 'judged', line: null, confidence: 0.95},
    ],
    listed: [{field: 'tags', values: ['portugal', 'city breaks'], line: 'k4', confidence: 0.99}],
  }
  let key = 0
  const apply = (document: Record<string, unknown>, answer = response, isPublished = false) =>
    applySorting({document, writing, sortable, response: answer, isPublished, keyGenerator: () => `key${++key}`})

  it('fills the document and moves what it placed out of the body', () => {
    key = 0
    const sorted = apply({_id: 'drafts.a', _type: 'article', body})
    expect(sorted.next).toEqual({
      _id: 'drafts.a',
      _type: 'article',
      title: 'A Week in Lisbon',
      slug: {_type: 'slug', current: 'a-week-in-lisbon'},
      excerpt: 'Seven days and one very steep tram.',
      author: {_type: 'reference', _ref: 'author-sam'},
      categories: [{_type: 'reference', _ref: 'cat-travel', _key: 'key1'}],
      tags: ['portugal', 'city breaks'],
      body: [body[4]],
    })
    expect(sorted.touched.sort()).toEqual(['author', 'body', 'categories', 'excerpt', 'slug', 'tags', 'title'])
    expect(sorted.filled).toEqual(['Excerpt', 'Author', 'Categories', 'Tags'])
    expect(sorted.filledNames).toEqual(['excerpt', 'author', 'categories', 'tags'])
    expect(sorted.titled).toBe(true)
  })

  it('keeps a title the Writer typed, and drops the pasted copy only when it says the same', () => {
    const same = apply({title: 'A week in Lisbon!', body}, {...response, placed: [], picked: [], listed: []})
    expect(same.next.title).toBe('A week in Lisbon!')
    expect((same.next.body as unknown[]).length).toBe(4)
    expect(same.touched).toEqual(['body'])
    const different = apply({title: 'Lisbon, slowly', body}, {...response, placed: [], picked: [], listed: []})
    expect(different.touched).toEqual([])
    expect(different.next.body).toBe(body)
  })

  it('leaves the slug alone once published, or once set by hand', () => {
    expect(apply({body}, response, true).next.slug).toBeUndefined()
    expect(apply({body, slug: {_type: 'slug', current: 'my-own'}}).next.slug).toEqual({_type: 'slug', current: 'my-own'})
  })

  it('fills only what is still empty', () => {
    const sorted = apply({body, excerpt: 'Typed meanwhile.', tags: ['mine']})
    expect(sorted.next.excerpt).toBe('Typed meanwhile.')
    expect(sorted.next.tags).toEqual(['mine'])
    expect((sorted.next.body as Array<{_key: string}>).map((entry) => entry._key)).toEqual(['k3', 'k4', 'k5'])
  })

  it('keeps every tag of a line longer than the route reads', () => {
    const all = Array.from({length: 120}, (_, i) => `tag number ${i}`)
    const long = [...body.slice(0, 3), block('k4', `Tags: ${all.join(', ')}`), body[4]]
    // What the route saw: the line cut at its limit.
    const cut = all.join(', ').slice(0, 594).split(', ')
    const sorted = apply({body: long}, {...response, listed: [{field: 'tags', values: cut, line: 'k4', confidence: 0.99}]})
    expect(sorted.next.tags).toEqual(all)
  })

  it('ignores an answer the field does not offer, and keeps its line', () => {
    const sorted = apply({body}, {...response, picked: [{field: 'author', options: ['someone-else'], kind: 'stated', line: 'k2', confidence: 1}]})
    expect(sorted.next.author).toBeUndefined()
    expect((sorted.next.body as Array<{_key: string}>).map((entry) => entry._key)).toContain('k2')
  })

  it('keeps unmatched text from a line claimed by an older route', () => {
    const long = block('k6', `Categories: Travel, ${'Travel, '.repeat(90)}unrecognized`)
    const mixed = block('k7', 'By Sam Okafor and Ana Reis')
    const sorted = apply(
      {body: [long, mixed]},
      {...response, listed: [], picked: [{...response.picked[0], line: 'k7'}, {...response.picked[1], line: 'k6'}]},
    )
    expect(sorted.filledNames).toEqual(['author', 'categories'])
    expect(sorted.next.body).toEqual([long, mixed])
  })

  it('says what it did', () => {
    expect(sortedMessage({filled: ['Excerpt', 'Author', 'Tags'], titled: true})).toBe('Sorted. Excerpt, author and tags are in Details.')
    expect(sortedMessage({filled: ['Excerpt'], titled: false})).toBe('Sorted. Excerpt is in Details.')
    expect(sortedMessage({filled: [], titled: true})).toBe('Sorted. The title is in place.')
    expect(sortedMessage({filled: [], titled: false})).toBeNull()
  })

  it('strips a Markdown heading mark from a placed line', () => {
    expect(unmarked('## Alfama, on foot')).toBe('Alfama, on foot')
    expect(unmarked('#hashtag stays')).toBe('#hashtag stays')
  })

  it('marks a field only while it holds what Sorting put there', () => {
    sortingMarks.set('doc', {excerpt: 'Placed.', tags: ['a', 'b']})
    expect(sortingMarks.has('doc', 'excerpt', 'Placed.')).toBe(true)
    expect(sortingMarks.has('doc', 'tags', ['a', 'b'])).toBe(true)
    expect(sortingMarks.has('doc', 'excerpt', 'Placed, then edited.')).toBe(false)
    expect(sortingMarks.has('doc', 'title', 'Placed.')).toBe(false)
    expect(sortingMarks.has('other', 'excerpt', 'Placed.')).toBe(false)
    sortingMarks.clear('doc')
    expect(sortingMarks.has('doc', 'excerpt', 'Placed.')).toBe(false)
  })

  it('compares content, not bookkeeping', () => {
    expect(contentOf({_rev: 'a', title: 'T', body})).toBe(contentOf({_rev: 'b', _updatedAt: 'now', body, title: 'T'}))
    expect(contentOf({title: 'T'})).not.toBe(contentOf({title: 'T2'}))
    // Key order is not an edit.
    expect(contentOf({author: {_type: 'reference', _ref: 'a'}})).toBe(contentOf({author: {_ref: 'a', _type: 'reference'}}))
    // Only the fields asked about count.
    expect(contentOf({title: 'T', excerpt: 'one'}, ['title'])).toBe(contentOf({title: 'T', excerpt: 'two'}, ['title']))
    expect(contentOf({title: 'T'}, ['title'])).not.toBe(contentOf({title: 'T2'}, ['title']))
  })
})
