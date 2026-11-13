import {type DocumentHandle} from '@sanity/sdk-react'
import {useCallback, useMemo} from 'react'
import {useWorkspace} from 'sanity'
import {useRouter} from 'sanity/router'
import {useWritingTypes} from './kinds'
import {detailsState, openedView, roomState} from './room-route'

function useStudioPath() {
  const {basePath} = useWorkspace()
  return useCallback((path: string) => `${basePath.replace(/\/+$/, '')}/${path}`, [basePath])
}

export function useLeaveToStudio() {
  const {navigateUrl} = useRouter()
  const studioPath = useStudioPath()
  return useCallback(() => navigateUrl({path: studioPath('structure')}), [navigateUrl, studioPath])
}

/** Opens the standard document form in Structure. */
export function useOpenInStructure({documentId, documentType}: DocumentHandle) {
  const {navigateIntent} = useRouter()
  return useCallback(
    () => navigateIntent('edit', {id: documentId, type: documentType}),
    [navigateIntent, documentId, documentType],
  )
}

/** The room's two views of one document: the Prose, and its Details. */
export function useRoomView({documentId, documentType}: DocumentHandle) {
  const {navigate, state} = useRouter()
  const types = useWritingTypes()
  const {details: inDetails, field} = openedView(state)
  const room = useMemo(() => roomState(documentId, documentType, types), [documentId, documentType, types])

  /** With a field name, Details opens with that field focused. */
  const openDetails = useCallback((toField?: string) => navigate(detailsState(room, toField)), [navigate, room])
  const toProse = useCallback(() => navigate(room), [navigate, room])
  return {inDetails, field, openDetails, toProse}
}
