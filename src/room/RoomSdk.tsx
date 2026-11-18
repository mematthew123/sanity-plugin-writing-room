import {ResourceProvider} from '@sanity/sdk-react'
import {type ReactNode, useMemo} from 'react'
import {useWorkspace} from 'sanity'

/**
 * Gives the room an App SDK instance whichever copy of `@sanity/sdk-react` it was bundled with.
 *
 * When the room shares the Studio's copy, `ResourceProvider` finds the Studio's instance and
 * reuses it. When it doesn't (an auto-updating Studio loads `sanity` from a CDN with its own SDK
 * inside, so the Studio's instance is out of reach), it makes one for the room, set up the way the
 * Studio sets up its own: the Workspace's project and dataset, signed in by the Studio.
 */
export function RoomSdkProvider({children}: {children: ReactNode}) {
  const workspace = useWorkspace()
  const {apiHost, authenticated} = workspace
  const token = workspace.auth.token

  const auth = useMemo(() => (apiHost ? {apiHost} : undefined), [apiHost])
  const studio = useMemo(
    () => ({authenticated, auth: token ? {token} : undefined}),
    [authenticated, token],
  )

  return (
    <ResourceProvider
      key={workspace.name}
      projectId={workspace.projectId}
      dataset={workspace.dataset}
      auth={auth}
      studio={studio}
      fallback={null}
    >
      {children}
    </ResourceProvider>
  )
}
