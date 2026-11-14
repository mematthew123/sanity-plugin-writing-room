import {sanitySchemaToPortableTextSchema} from '@portabletext/sanity-bridge'
import {type ArraySchemaType, type AssetSource, createSchema, type ImageSchemaType} from 'sanity'
import {describe, expect, it} from 'vitest'
import {schemaTypes} from '../../schema'
import {bodyAllows} from './allows'
import {matchCommands} from './commands'
import {bodyImages, chosenImage, resolveImageSources} from './image-sources'

const source = (name: string): AssetSource => ({name, component: () => null})
const uploads = source('sanity-default')
const library = source('sanity-media-library')
const unsplash = source('unsplash')
const form = (assetSources: unknown, directUploads = true) => ({image: {assetSources, directUploads}})
const imageType = (options: ImageSchemaType['options']) => ({options}) as ImageSchemaType

describe('resolveImageSources', () => {
  it('offers the Studio’s sources when the image type names none', () => {
    expect(resolveImageSources([uploads, library], undefined)).toEqual([uploads, library])
  })

  it('lets the image type replace them: by name, with a source of its own, or with a filter', () => {
    expect(resolveImageSources([uploads, library], ['sanity-media-library', 'not-set-up'])).toEqual([library])
    expect(resolveImageSources([uploads], [unsplash])).toEqual([unsplash])
    expect(resolveImageSources([uploads, library], (candidate) => candidate.name !== 'sanity-default')).toEqual([
      library,
    ])
  })

  it('offers none when the image type is upload-only', () => {
    expect(resolveImageSources([uploads, library], [])).toEqual([])
  })
})

describe('bodyImages', () => {
  it('reads what the Studio has set up', () => {
    expect(bodyImages(form([uploads, library]), undefined)).toMatchObject({upload: true, sources: [uploads, library]})
  })

  it('follows a Studio or an image type that has turned uploads off', () => {
    expect(bodyImages(form([uploads], false), undefined).upload).toBe(false)
    expect(bodyImages(form([uploads]), imageType({disableNew: true})).upload).toBe(false)
  })

  it('still uploads when the Studio’s list can’t be read', () => {
    expect(bodyImages(undefined, undefined)).toMatchObject({upload: true, sources: []})
    expect(bodyImages({image: {assetSources: 'changed'}}, undefined)).toMatchObject({upload: true, sources: []})
  })
})

describe('the Insert Menu’s image rows', () => {
  const allows = bodyAllows(
    sanitySchemaToPortableTextSchema(
      createSchema({name: 'test', types: schemaTypes}).get('body') as ArraySchemaType<unknown>,
    ),
  )
  const rows = (images: {upload: boolean; sources: AssetSource[]}, keyword = 'image') =>
    matchCommands(keyword, allows, images).map((command) => command.label)

  it('offers each only when it can work', () => {
    expect(rows({upload: true, sources: [uploads]})).toEqual(['Upload an image', 'Choose an image'])
    expect(rows({upload: true, sources: []})).toEqual(['Upload an image'])
    expect(rows({upload: false, sources: [uploads]})).toEqual(['Choose an image'])
    expect(rows({upload: false, sources: []})).toEqual([])
  })

  it('finds both under the words a Writer might type', () => {
    expect(rows({upload: true, sources: [uploads]}, 'photo')).toEqual(['Upload an image', 'Choose an image'])
    expect(rows({upload: true, sources: [uploads]}, 'upload')).toEqual(['Upload an image'])
    expect(rows({upload: true, sources: [uploads]}, 'choose')).toEqual(['Choose an image'])
  })
})

describe('chosenImage', () => {
  it('points at an image that already exists', () => {
    expect(chosenImage({kind: 'assetDocumentId', value: 'image-abc-800x600-jpg'})).toEqual({
      kind: 'block',
      props: {asset: {_type: 'reference', _ref: 'image-abc-800x600-jpg'}},
    })
  })

  it('keeps a Media Library image tied to its library', () => {
    expect(
      chosenImage({
        kind: 'assetDocumentId',
        value: 'image-abc-800x600-jpg',
        mediaLibraryProps: {mediaLibraryId: 'ml1', assetId: 'asset1', assetInstanceId: 'instance1'},
      }),
    ).toEqual({
      kind: 'block',
      props: {
        asset: {_type: 'reference', _ref: 'image-abc-800x600-jpg'},
        media: {_type: 'globalDocumentReference', _ref: 'media-library:ml1:asset1', _weak: true},
      },
    })
  })

  it('uploads a file a source hands back, with what the source says about it', async () => {
    const file = new File(['x'], 'harbour.jpg', {type: 'image/jpeg'})
    const chosen = chosenImage({
      kind: 'file',
      // Sanity's types name their own `File` here; sources hand back the browser's.
      value: file as never,
      assetDocumentProps: {
        creditLine: 'Sam by Unsplash',
        source: {name: 'unsplash', id: 'u1'},
        description: '',
      } as never,
    })
    if (chosen.kind !== 'file') throw new Error('expected a file')
    expect(await chosen.file()).toBe(file)
    expect(chosen.options).toEqual({
      filename: 'harbour.jpg',
      creditLine: 'Sam by Unsplash',
      source: {name: 'unsplash', id: 'u1'},
    })
  })

  it('treats a URL as a file to fetch', () => {
    const chosen = chosenImage({
      kind: 'url',
      value: 'https://example.com/a.png',
      assetDocumentProps: {originalFilename: 'a.png'} as never,
    })
    expect(chosen).toMatchObject({kind: 'file', options: {filename: 'a.png'}})
  })

  it('refuses a selection it can’t use', () => {
    expect(() => chosenImage({kind: 'assetDocumentId', value: new File([], 'a.png') as never})).toThrow()
  })
})
