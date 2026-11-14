import {type AssetSource, type AssetSourceComponentProps} from 'sanity'

const PIXEL =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

function TestPictures({onSelect, onClose}: AssetSourceComponentProps) {
  const handBack = () => {
    const bytes = Uint8Array.from(atob(PIXEL), (character) => character.charCodeAt(0))
    const file = new File([bytes], 'e2e-handed-back.png', {type: 'image/png'})
    // Sanity's types name their own `File` here; sources hand back the browser's.
    onSelect([{kind: 'file', value: file as never}])
  }
  return (
    <div
      role="dialog"
      aria-label="Test pictures"
      style={{position: 'fixed', inset: '20% 30%', zIndex: 100000, padding: 24, background: 'Canvas', color: 'CanvasText'}}
    >
      <button type="button" onClick={handBack}>
        Hand back a file
      </button>
      <button type="button" onClick={onClose}>
        Close
      </button>
    </div>
  )
}

/**
 * A second image source for the dev Studio, so the browser tests have what a plain Studio doesn't:
 * more than one source to choose between, and one that hands back a file rather than an image
 * that already exists.
 */
export const testPictures: AssetSource = {
  name: 'e2e-test-pictures',
  title: 'Test pictures',
  component: TestPictures,
}
