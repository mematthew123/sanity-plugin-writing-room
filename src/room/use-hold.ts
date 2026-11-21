import {useEffect, useState} from 'react'
import {useClient, useCurrentUser} from 'sanity'
import {API_VERSION} from '../lib/api-version'
import {checkHold} from '../lib/holds'
import {versionIdOf} from '../lib/schedule'

/**
 * Whether a workflow would hold the publish a schedule is about to make. Sanity publishes a
 * scheduled document whatever a workflow says, so this is the one Hold the room looks for
 * without being asked. Looked for when the room opens on it and whenever the Writer comes back.
 */
export function useScheduledHold(
  {documentId, documentType}: {documentId: string; documentType: string},
  releaseId: string | undefined,
): boolean {
  const client = useClient({apiVersion: API_VERSION})
  const identity = useCurrentUser()?.id
  const [heldFor, setHeldFor] = useState<string | null>(null)
  const scheduled = releaseId ? `${releaseId} ${documentId}` : null

  useEffect(() => {
    if (!releaseId || !scheduled) return undefined
    let superseded = false
    const look = () => {
      if (document.visibilityState !== 'visible') return
      void checkHold(client, {
        action: 'publish',
        documentId,
        documentType,
        identity,
        from: versionIdOf(documentId, releaseId),
      }).then((verdict) => {
        if (!superseded) setHeldFor(verdict.kind === 'held' ? scheduled : null)
      })
    }
    look()
    document.addEventListener('visibilitychange', look)
    return () => {
      superseded = true
      document.removeEventListener('visibilitychange', look)
    }
  }, [client, documentId, documentType, releaseId, scheduled, identity])

  return scheduled !== null && heldFor === scheduled
}
