import {type DocumentHandle} from '@sanity/sdk-react'
import {useCallback} from 'react'
import {useWorkspace} from 'sanity'
import {useRouter} from 'sanity/router'

function useStudioPath() {
  const {basePath} = useWorkspace()
  return useCallback((path: string) => `${basePath.replace(/\/+$/, '')}/${path}`, [basePath])
}

/** Leaves the Writing Room for the rest of the Studio. */
export function useLeaveToStudio() {
  const {navigateUrl} = useRouter()
  const studioPath = useStudioPath()
  return useCallback(() => navigateUrl({path: studioPath('structure')}), [navigateUrl, studioPath])
}

/** The full list of one type (all Posts, all Case Studies), in Structure. */
export function useAllOfTypePath(documentType: string) {
  return useStudioPath()(`structure/${documentType}`)
}

/** Opens a document's Details (the standard form) in Structure. */
export function useOpenDetails({documentId, documentType}: DocumentHandle) {
  const {navigateIntent} = useRouter()
  return useCallback(
    () => navigateIntent('edit', {id: documentId, type: documentType}),
    [navigateIntent, documentId, documentType],
  )
}
