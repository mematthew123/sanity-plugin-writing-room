import {createClient, type SanityClient} from '@sanity/client'
import {dataset, projectId, token} from './env'

/** Every document the tests make has an id that starts with this, so they can be swept up. */
export const ID_PREFIX = 'e2e-'

export function contentClient(): SanityClient {
  return createClient({projectId, dataset, token, apiVersion: '2026-05-04', useCdn: false, perspective: 'raw'})
}
