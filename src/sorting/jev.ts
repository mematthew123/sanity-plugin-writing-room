import {experimental_decide as decide} from 'ai'
import {type SortingAnswer} from './answers'
import {type SortingDecide} from './handler'

/** TypeSafe's Jev on Vercel AI Gateway. */
export const JEV = 'typesafe-ai/jev'

type DecideInput = Parameters<typeof decide>[0]

/**
 * Asks Jev through Vercel AI Gateway, with the AI SDK's `experimental_decide`. On Vercel the
 * gateway takes the deployment's own OIDC token; anywhere else, set `AI_GATEWAY_API_KEY`.
 *
 * `model` is a gateway model id, or a decision model from a provider package, for a Studio that
 * would rather call TypeSafe directly.
 */
export function jev(model: DecideInput['model'] = JEV): SortingDecide {
  return async ({state, questions, abortSignal}) => {
    const result = await decide({model, state, questions, abortSignal})
    // TypeSafe reports a confidence per question beside the answers.
    const reported = (result.providerMetadata as Record<string, {confidence?: unknown}> | undefined)?.typesafe?.confidence
    const confidence: Record<string, number> = {}
    if (reported && typeof reported === 'object') {
      for (const [id, value] of Object.entries(reported)) {
        if (typeof value === 'number') confidence[id] = value
      }
    }
    return {answers: result.answers as Record<string, SortingAnswer | undefined>, confidence}
  }
}
