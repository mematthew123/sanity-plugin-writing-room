import {Component, type ReactNode, Suspense} from 'react'
import {type AssetFromSource, type AssetSource, type ImageSchemaType} from 'sanity'

/**
 * An image source's own dialog, as the Studio shows it. It is Sanity's (or a plugin's), so it keeps
 * its own behaviour and the Studio's theme: the room opens it and takes what it hands back.
 */
export function ImageSourceDialog({
  source,
  type,
  onSelect,
  onClose,
  onFailed,
}: {
  source: AssetSource
  type: ImageSchemaType | undefined
  onSelect: (chosen: AssetFromSource[]) => void
  onClose: () => void
  onFailed: () => void
}) {
  const Source = source.component
  return (
    <SourceBoundary onFailed={onFailed}>
      <Suspense fallback={null}>
        <Source
          action="select"
          assetSource={source}
          assetType="image"
          accept={type?.options?.accept ?? 'image/*'}
          selectionType="single"
          selectedAssets={[]}
          dialogHeaderTitle="Choose an image"
          schemaType={type}
          onSelect={onSelect}
          onClose={onClose}
        />
      </Suspense>
    </SourceBoundary>
  )
}

/** Fails soft: a source that can't render never takes the Prose down with it. */
class SourceBoundary extends Component<{children: ReactNode; onFailed: () => void}, {failed: boolean}> {
  state = {failed: false}

  static getDerivedStateFromError() {
    return {failed: true}
  }

  componentDidCatch(error: unknown) {
    console.error('[sanity-plugin-writing-room] An image source couldn’t render.', error)
    this.props.onFailed()
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}
