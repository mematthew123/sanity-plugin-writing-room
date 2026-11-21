import {type SanityClient} from 'sanity'
import {draftIdOf} from './schedule'

/**
 * The document type a workflow writes a Hold as, beside the document it holds. Sanity has said
 * the `temp.` prefix will go; `holds.test.ts` fails when the engine's own name moves on.
 */
export const GUARD_TYPE = 'temp.system.guard'

/** What the Writer is about to do. Scheduling is a publish agreed to now, so it asks as `publish`. */
export type HeldAction = 'publish' | 'discard'

export type HoldVerdict =
  | {kind: 'clear'}
  /** `reason` is the workflow author's own description of the Hold, when they wrote one. */
  | {kind: 'held'; reason?: string}
  /** A Hold is there and the room can't tell whether it applies. Refused: someone asked for it. */
  | {kind: 'unreadable'}

export const CLEAR: HoldVerdict = {kind: 'clear'}

type Stored = Record<string, unknown> & {_id: string; _type: string}

/** The document as the action would leave it, and as it is now: what a Hold's rule is asked about. */
export interface Mutation {
  before: Stored | null
  after: Stored | null
  action: 'create' | 'update' | 'delete'
}

/** The part of `@sanity/workflows` the room uses, so a test can stand in for it. */
export interface Evaluator {
  parseGuardDocument: (doc: unknown) => {description?: string}
  documentActionDenials: (args: {
    mutation: Mutation
    resource: {type: string; id: string}
    // The engine's own type; the room only passes on what `parseGuardDocument` returned.
    guards: readonly never[]
    identity?: string
    dereference?: (ref: {_ref: string}) => PromiseLike<Record<string, unknown> | null>
  }) => Promise<Array<{description?: string}>>
  clientGuardDereference: (
    client: Pick<SanityClient, 'getDocument'>,
  ) => (ref: {_ref: string}) => PromiseLike<Record<string, unknown> | null>
}

/** Loaded only once a Hold has been found, so a Studio without workflows never downloads it. */
const loadEvaluator = (): Promise<Evaluator> => import('@sanity/workflows') as unknown as Promise<Evaluator>

/**
 * What the action would write, as the Workflows Studio plugin works it out for Structure's own
 * Publish and Delete, so the room and Structure ask a Hold the same question.
 */
export function mutationFor(
  action: HeldAction,
  documentId: string,
  {draft, published}: {draft: Stored | null; published: Stored | null},
): Mutation | null {
  if (action === 'publish') {
    if (!draft) return null
    return {
      before: published ? {...published, _id: documentId} : null,
      after: {...draft, _id: documentId},
      action: published ? 'update' : 'create',
    }
  }
  const current = draft ?? published
  return current ? {before: current, after: null, action: 'delete'} : null
}

// Only the Holds that could be about this document, so that another document's Hold never costs
// this one the engine's download, or a refusal if it can't be read. A Hold names documents by id
// or by pattern (or names none, and means them all), and may narrow that to some types. Patterns
// are left to the engine to match.
const GUARDS_QUERY = `*[_type == $type
  && (count(coalesce(match.types, [])) == 0 || $documentType in match.types)
  && (
    $id in match.idRefs || $draftId in match.idRefs || count(coalesce(match.idPatterns, [])) > 0
    || (count(coalesce(match.idRefs, [])) == 0 && count(coalesce(match.idPatterns, [])) == 0)
  )]`

const warn = (message: string, error: unknown) => console.warn(`[sanity-plugin-writing-room] ${message}`, error)

/**
 * Whether a workflow is holding this action on this document, asked the way Structure asks.
 *
 * Two kinds of not knowing are told apart. If the Holds can't be read at all, the action goes
 * ahead: a role that can't see them would otherwise lose Publish in the room altogether. If a
 * Hold is there and can't be weighed, the action is refused.
 */
export async function checkHold(
  client: SanityClient,
  {
    action,
    documentId,
    documentType,
    identity,
    from,
  }: {
    action: HeldAction
    documentId: string
    documentType: string
    identity?: string
    /** The document that would be published, when it isn't the draft: a scheduled copy. */
    from?: string
  },
  load: () => Promise<Evaluator> = loadEvaluator,
): Promise<HoldVerdict> {
  const draftId = draftIdOf(documentId)
  let found: unknown[]
  try {
    found = await client.fetch<unknown[]>(
      GUARDS_QUERY,
      {type: GUARD_TYPE, id: documentId, draftId, documentType},
      {perspective: 'raw', tag: 'writing-room.holds'},
    )
  } catch (error) {
    warn('Couldn’t read this document’s workflow holds, so none were applied.', error)
    return CLEAR
  }
  if (found.length === 0) return CLEAR

  try {
    const {projectId, dataset} = client.config()
    if (!projectId || !dataset) throw new Error('The Studio’s client has no project or dataset.')
    const [evaluator, draft, published] = await Promise.all([
      load(),
      client.getDocument<Stored>(from ?? draftId),
      client.getDocument<Stored>(documentId),
    ])
    const mutation = mutationFor(action, documentId, {draft: draft ?? null, published: published ?? null})
    if (!mutation) return CLEAR
    const denials = await evaluator.documentActionDenials({
      mutation,
      resource: {type: 'dataset', id: `${projectId}.${dataset}`},
      guards: found.map((guard) => evaluator.parseGuardDocument(guard)) as never[],
      dereference: evaluator.clientGuardDereference(client),
      ...(identity ? {identity} : {}),
    })
    if (denials.length === 0) return CLEAR
    const reason = denials.map((guard) => guard.description?.trim()).find(Boolean)
    return reason ? {kind: 'held', reason} : {kind: 'held'}
  } catch (error) {
    warn('A workflow hold on this document couldn’t be checked, so it was applied.', error)
    return {kind: 'unreadable'}
  }
}

/** A scheduled document goes live whatever a workflow says, so the room says so while it can be unlocked. */
export function scheduledButHeld(singular: string): string {
  return `A workflow is holding this ${singular}, but it will still go live when scheduled. Unlock it to stop that.`
}

/** Per DESIGN.md, Voice & Copy: what happened, then what to do. Never a workflow's machine name. */
export function holdSentence(verdict: HoldVerdict, singular: string, action: HeldAction): string | null {
  if (verdict.kind === 'clear') return null
  const thing = singular
  if (verdict.kind === 'unreadable') {
    return action === 'publish'
      ? `Couldn’t check this ${thing}’s workflow just now. Try again in a moment, or publish it from Structure.`
      : `Couldn’t check this ${thing}’s workflow just now. Try again in a moment.`
  }
  const said =
    action === 'publish'
      ? `A workflow is holding this ${thing}. It can be published once the workflow allows it.`
      : `A workflow is holding this ${thing}, so it can’t be discarded yet.`
  if (!verdict.reason) return said
  return `${said} ${/[.!?]$/.test(verdict.reason) ? verdict.reason : `${verdict.reason}.`}`
}
