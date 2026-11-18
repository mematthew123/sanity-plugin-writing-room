/**
 * What an entry in the Studio's `document.actions` is to the room:
 *
 * - `room`: Sanity's Publish, wrapped by this plugin. The room has its own way of doing it.
 * - `builtin`: another of Sanity's own (Delete, Duplicate…). Never the room's to offer.
 * - `custom`: a Studio's own action ("Request review"). The room runs it as the form would.
 * - `skip`: not a step at all, such as "Open in Writing Room".
 */
export type StepKind = 'room' | 'builtin' | 'custom'

export interface Step<Action> {
  action: Action
  kind: StepKind
}

/**
 * The actions that can decide the room's one button, in the Studio's order. The form's main button
 * is the first action that has something to show; `room` and `builtin` always do, so nothing after
 * the first of those can matter and nothing after it is run.
 */
export function stepsToConsider<Action>(
  actions: readonly Action[],
  kindOf: (action: Action) => StepKind | 'skip',
): Array<Step<Action>> {
  const steps: Array<Step<Action>> = []
  for (const action of actions) {
    const kind = kindOf(action)
    if (kind === 'skip') continue
    steps.push({action, kind})
    if (kind !== 'custom') break
  }
  return steps
}

/** The step the first shown action belongs to: a custom action that returns nothing is passed over. */
export function nextStep<Action>(
  steps: ReadonlyArray<Step<Action>>,
  shown: (step: Step<Action>, index: number) => boolean,
): {step: Step<Action>; index: number} | null {
  const index = steps.findIndex((step, at) => step.kind !== 'custom' || shown(step, at))
  const step = steps[index]
  return step ? {step, index} : null
}
