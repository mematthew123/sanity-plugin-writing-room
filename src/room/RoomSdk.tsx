import {
  createSanityInstance,
  ResourceProvider,
  type SanityConfig,
  type SanityInstance,
  SanityInstanceProvider,
  useSanityInstance,
} from '@sanity/sdk-react'
import {type ReactNode, useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {useWorkspace} from 'sanity'

/**
 * Gives the room an App SDK instance whichever copy of `@sanity/sdk-react` it was bundled with.
 *
 * When the room shares the Studio's copy, `ResourceProvider` finds the Studio's instance and
 * reuses it. When it doesn't (an auto-updating Studio loads `sanity` from a CDN with its own SDK
 * inside, so the Studio's instance is out of reach), the room makes one, set up the way the
 * Studio sets up its own: the Workspace's project and dataset, signed in by the Studio.
 */
export function RoomSdkProvider({children}: {children: ReactNode}) {
  const workspace = useWorkspace()
  const studioInstance = useStudioInstance()
  const {apiHost, authenticated, projectId, dataset} = workspace
  const token = workspace.auth.token

  const config = useMemo(
    (): SanityConfig => ({
      projectId,
      dataset,
      auth: apiHost ? {apiHost} : undefined,
      studio: {authenticated, auth: token ? {token} : undefined},
    }),
    [projectId, dataset, apiHost, authenticated, token],
  )

  // Under either instance, this only names the Workspace's dataset as the one the hooks read.
  const room = (
    <ResourceProvider key={workspace.name} {...config} fallback={null}>
      {children}
    </ResourceProvider>
  )
  if (studioInstance) return room
  return (
    <RoomInstance key={workspace.name} config={config}>
      {room}
    </RoomInstance>
  )
}

/** The Studio's instance, or `null` when the room has a copy of the SDK to itself. */
function useStudioInstance(): SanityInstance | null {
  try {
    return useSanityInstance()
  } catch {
    return null
  }
}

/**
 * An instance that belongs to the room: made when the room appears, disposed (with its sign-in
 * and listeners) when the room leaves the page.
 *
 * An effect's cleanup can't tell the two apart: it also runs when an `<Activity>` hides the room,
 * and a hidden room must come back to a live instance. So cleanup asks whether the room's
 * marker element is still in the document. Gone: dispose. Still there: the room is only hidden, so
 * keep the instance and watch for the marker to leave.
 */
function RoomInstance({config, children}: {config: SanityConfig; children: ReactNode}) {
  const [instance, setInstance] = useState<SanityInstance | null>(null)
  const held = useRef<SanityInstance | null>(null)
  const marker = useRef<HTMLElement | null>(null)
  const stopWatching = useRef<(() => void) | null>(null)
  // React clears refs when it hides a tree; cleanup still needs the element.
  const keepMarker = useCallback((node: HTMLElement | null) => {
    if (node) marker.current = node
  }, [])

  useEffect(() => {
    stopWatching.current?.()
    stopWatching.current = null
    // Like `ResourceProvider`, the instance keeps the config it was made with.
    if (!held.current || held.current.isDisposed()) {
      held.current = createSanityInstance(config)
      setInstance(held.current)
    }

    return () => {
      const node = marker.current
      const dispose = () => {
        held.current?.dispose()
        held.current = null
      }
      if (!node?.isConnected) {
        dispose()
        return
      }
      const observer = new MutationObserver(() => {
        if (node.isConnected) return
        observer.disconnect()
        dispose()
      })
      observer.observe(node.ownerDocument, {childList: true, subtree: true})
      stopWatching.current = () => observer.disconnect()
    }
  }, [config])

  return (
    <>
      <span ref={keepMarker} hidden />
      {instance && (
        <SanityInstanceProvider instance={instance} fallback={null}>
          {children}
        </SanityInstanceProvider>
      )}
    </>
  )
}
