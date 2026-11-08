import {createPreviewSecret} from '@sanity/preview-url-secret/create-secret'
import {
  urlSearchParamPreviewPathname,
  urlSearchParamPreviewSecret,
} from '@sanity/preview-url-secret/constants'
import {useState} from 'react'
import {useClient, useCurrentUser} from 'sanity'
import {useWritingRoomConfig} from '../config'
import {API_VERSION} from '../lib/api-version'
import {QuietButton} from './primitives'

/**
 * Opens the Post on the Reading Site exactly as readers will see it, unpublished changes
 * included. A one-hour preview secret lets the site switch itself into draft mode.
 */
export function PreviewButton({slug, onProblem}: {slug: string | undefined; onProblem: (problem: string) => void}) {
  const client = useClient({apiVersion: API_VERSION})
  const user = useCurrentUser()
  const [opening, setOpening] = useState(false)
  const {preview: options} = useWritingRoomConfig()

  if (!slug || !options) return null
  const {origin, enablePath, pathname} = options
  const path = pathname(slug)

  async function preview() {
    // Open the tab now, while the click still counts, so popup blockers allow it.
    const tab = window.open('about:blank', '_blank')
    if (tab) tab.opener = null
    setOpening(true)
    try {
      const {secret} = await createPreviewSecret(
        client,
        'sanity-plugin-writing-room',
        window.location.origin,
        user?.id,
      )
      const url = new URL(enablePath, origin)
      url.searchParams.set(urlSearchParamPreviewSecret, secret)
      url.searchParams.set(urlSearchParamPreviewPathname, path)
      if (tab) tab.location.href = url.toString()
      else window.open(url, '_blank', 'noopener')
    } catch {
      tab?.close()
      onProblem('The preview couldn’t be opened just now. Try again in a moment.')
    } finally {
      setOpening(false)
    }
  }

  return (
    <QuietButton onClick={() => void preview()} disabled={opening} title="Preview on your site">
      Preview
    </QuietButton>
  )
}
