import {type DocumentHandle} from '@sanity/sdk-react'
import {createContext, useCallback, useContext} from 'react'
import {useRouter} from 'sanity/router'

/** The document being written and its body field, for blocks that link out to Details. */
export const RoomDocumentContext = createContext<{handle: DocumentHandle; bodyField: string} | null>(
  null,
)

/** Opens one body block in the standard form, where the Studio's own inputs can edit it. */
export function useOpenBlockDetails(blockKey: string) {
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
