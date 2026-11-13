import {type DocumentHandle} from '@sanity/sdk-react'
import {useCallback, useMemo} from 'react'
import {useWorkspace} from 'sanity'
import {useRouter} from 'sanity/router'
import {useHasDetails, useWritingTypes} from './kinds'
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

const focusAsks = new EventTarget()

/** Hears each time the Writer is sent to the Details field that's already in the URL. */
export function onDetailsFocusAsked(listener: () => void): () => void {
  focusAsks.addEventListener('ask', listener)
  return () => focusAsks.removeEventListener('ask', listener)
}

/** Sends the Writer on from the title to the first of the Details. The form moves the focus, not the room. */
export function askForFirstDetail() {
  focusAsks.dispatchEvent(new Event('first'))
}

export function onFirstDetailAsked(listener: () => void): () => void {
  focusAsks.addEventListener('first', listener)
  return () => focusAsks.removeEventListener('first', listener)
}

/** The room's two views of one document: the Prose, and its Details. */
export function useRoomView(handle: DocumentHandle) {
  const {documentId, documentType} = handle
  const {navigate, state} = useRouter()
  const types = useWritingTypes()
  const hasDetails = useHasDetails(documentType)
  const openInStructure = useOpenInStructure(handle)
  const opened = openedView(state)
  const inDetails = opened.details && hasDetails
  const field = opened.field
  const room = useMemo(() => roomState(documentId, documentType, types), [documentId, documentType, types])

  /**
   * With a field, Details opens with that field focused. A type with nothing for Details to show
   * has its fields in the Structure form, so that's where a field of its is found.
   */
  const openDetails = useCallback(
    (toField?: string) => {
      if (!hasDetails) openInStructure()
      // Already there: going again would only add a step to Back, and the field wouldn't hear of it.
      else if (inDetails && field === toField) focusAsks.dispatchEvent(new Event('ask'))
      else navigate(detailsState(room, toField))
    },
    [hasDetails, openInStructure, inDetails, field, navigate, room],
  )
  const toProse = useCallback(() => navigate(room), [navigate, room])
  return {hasDetails, inDetails, field, openDetails, toProse}
}
