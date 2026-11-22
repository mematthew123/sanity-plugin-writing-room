import {API_VERSION} from '../lib/api-version'
import {DEFAULT_FLOORS, readAnswers, type SortingAnswer, type SortingFloors} from './answers'
import {LIMITS, parseSortingRequest} from './contract'
import {buildDecision, type SortingDecision} from './questions'

/**
 * Asks the model. The default goes to Jev through Vercel AI Gateway (`./jev`); a Studio can pass
 * its own, and the tests do. `confidence`, per question id, is used when an answer carries no
 * probability for the option it chose.
 */
export type SortingDecide = (
  decision: SortingDecision & {abortSignal: AbortSignal},
) => Promise<{answers: Record<string, SortingAnswer | undefined>; confidence?: Record<string, number>}>

export interface SortingHandlerOptions {
  /** The Sanity project the Studio belongs to. Only its members may call the route. */
  projectId: string
  /** How the route asks the model. */
  decide: SortingDecide
  /**
   * The Studio's origin, when the route is on a different one (`https://my-studio.sanity.studio`).
   * Not needed when the Studio and the route share an origin.
   */
  origins?: string[]
  floors?: Partial<SortingFloors>
  /** How long the model gets, in milliseconds. Defaults to 10 seconds. */
  timeout?: number
  /** For tests. */
  fetch?: typeof fetch
}

const DEFAULT_TIMEOUT = 10_000

/** Whether the token belongs to someone with a role in the project. */
async function isMember(token: string, projectId: string, doFetch: typeof fetch, signal: AbortSignal) {
  const response = await doFetch(`https://${projectId}.api.sanity.io/v${API_VERSION}/users/me`, {
    headers: {authorization: `Bearer ${token}`},
    signal,
  })
  // A bad token is a 401. No token at all is a 200 with an empty object, so check what came back.
  if (!response.ok) return false
  const user = (await response.json()) as {id?: unknown; roles?: unknown}
  return typeof user.id === 'string' && user.id !== '' && Array.isArray(user.roles) && user.roles.length > 0
}

/**
 * The Sorting route, for a Studio's owner to mount. It checks the caller is a member of the
 * project, asks the model where the parts of a whole-piece paste belong, and answers. It reads
 * and writes no documents and holds no Sanity token of its own.
 */
export function createSortingRoute(options: SortingHandlerOptions): (request: Request) => Promise<Response> {
  const {projectId, decide, origins = [], timeout = DEFAULT_TIMEOUT} = options
  if (!/^[a-z0-9-]+$/i.test(projectId)) throw new Error('createSortingHandler(): `projectId` is missing or malformed.')
  const floors = {...DEFAULT_FLOORS, ...options.floors}

  return async function sortingRoute(request) {
    const doFetch = options.fetch ?? fetch
    const origin = request.headers.get('origin')
    const cors: Record<string, string> = {vary: 'Origin'}
    if (origin && origins.includes(origin)) {
      cors['access-control-allow-origin'] = origin
      cors['access-control-allow-methods'] = 'POST, OPTIONS'
      cors['access-control-allow-headers'] = 'authorization, content-type'
      cors['access-control-max-age'] = '86400'
    }
    const answer = (status: number, body?: unknown) =>
      body === undefined
        ? new Response(null, {status, headers: cors})
        : Response.json(body, {status, headers: {...cors, 'cache-control': 'no-store'}})

    if (request.method === 'OPTIONS') return answer(204)
    if (request.method !== 'POST') return answer(405, {error: 'method'})

    const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '')?.[1]
    if (!token) return answer(401, {error: 'unauthorized'})

    if (Number(request.headers.get('content-length') ?? 0) > LIMITS.body) return answer(413, {error: 'too-large'})
    let body: unknown
    try {
      const raw = await request.text()
      if (raw.length > LIMITS.body) return answer(413, {error: 'too-large'})
      body = JSON.parse(raw)
    } catch {
      return answer(400, {error: 'invalid', problem: 'The request is not JSON.'})
    }
    const parsed = parseSortingRequest(body)
    if ('problem' in parsed) return answer(400, {error: 'invalid', problem: parsed.problem})

    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(timeout)])
    try {
      if (!(await isMember(token, projectId, doFetch, signal))) return answer(403, {error: 'forbidden'})
    } catch {
      return answer(502, {error: 'unavailable'})
    }

    const decision = buildDecision(parsed.request)
    // Nothing to ask: no top blocks and no fields.
    if (Object.keys(decision.questions).length === 0) return answer(200, readAnswers(parsed.request, {}, {floors}))
    try {
      const {answers, confidence} = await decide({...decision, abortSignal: signal})
      return answer(200, readAnswers(parsed.request, answers, {floors, confidence}))
    } catch {
      // Never the model's or the gateway's own words: the room says it couldn't be done just now.
      return answer(502, {error: 'unavailable'})
    }
  }
}
