import {type NavbarProps} from 'sanity'
import {useRouterState} from 'sanity/router'
import {TOOL_NAME} from './constants'

/**
 * The Studio navbar, stepping aside while the Writer is writing. It stays in the Lobby: that's a
 * place to choose what to write, and the rest of the Studio should be one click away from it.
 */
export function RoomAwareNavbar(props: NavbarProps) {
  const isWriting = useRouterState((state) => {
    if (state.tool !== TOOL_NAME) return false
    // The Studio keeps each Tool's own router state under the Tool's name.
    const room = state[TOOL_NAME] as {documentId?: unknown} | undefined
    return typeof room?.documentId === 'string' && room.documentId !== ''
  })
  return isWriting ? null : props.renderDefault(props)
}
