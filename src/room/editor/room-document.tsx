import {type DocumentHandle} from '@sanity/sdk-react'
import {createContext, useCallback, useContext} from 'react'
import {useRouter} from 'sanity/router'

export const RoomDocumentContext = createContext<{handle: DocumentHandle; bodyField: string} | null>(
  null,
)

/** Opens one block of the body in the standard form in Structure. */
export function useOpenBlockInStructure(blockKey: string) {
  const room = useContext(RoomDocumentContext)
  const {navigateIntent} = useRouter()
  return useCallback(() => {
    if (!room) return
    navigateIntent('edit', {
      id: room.handle.documentId,
      type: room.handle.documentType,
      path: `${room.bodyField}[_key=="${blockKey}"]`,
    })
  }, [room, navigateIntent, blockKey])
}
