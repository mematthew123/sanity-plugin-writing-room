import {type NavbarProps} from 'sanity'
import {useRouterState} from 'sanity/router'
import {TOOL_NAME} from './constants'

/** The Studio navbar, stepping aside while the Writer is in the Writing Room. */
export function RoomAwareNavbar(props: NavbarProps) {
  const activeTool = useRouterState((state) => state.tool)
  return activeTool === TOOL_NAME ? null : props.renderDefault(props)
}
