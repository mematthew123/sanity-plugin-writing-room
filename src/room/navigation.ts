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

/** The full list of Posts, in Structure. */
export function useAllPostsPath() {
  return useStudioPath()('structure/post')
}

/** Opens a Post's Details (the standard form) in Structure. */
export function useOpenDetails(postId: string) {
  const {navigateIntent} = useRouter()
  return useCallback(() => navigateIntent('edit', {id: postId, type: 'post'}), [navigateIntent, postId])
}
