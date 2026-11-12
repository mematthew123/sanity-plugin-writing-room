import {type NavbarProps} from 'sanity'
import {useRouterState} from 'sanity/router'
import {TOOL_NAME} from './constants'

/** Steps aside while writing, but stays in the Lobby so the rest of the Studio is one click away. */
export function RoomAwareNavbar(props: NavbarProps) {
  const isWriting = useRouterState((state) => {
    if (state.tool !== TOOL_NAME) return false
    // The Studio keeps each Tool's own router state under the Tool's name.
    const room = state[TOOL_NAME] as {documentId?: unknown} | undefined
    return typeof room?.documentId === 'string' && room.documentId !== ''
  })
  return isWriting ? null : props.renderDefault(props)
}
