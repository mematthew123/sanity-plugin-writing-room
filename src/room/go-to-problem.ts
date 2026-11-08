import {type Editor} from '@portabletext/editor'
import {type ProblemTarget} from './publish-problems'

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function reveal(element: Element | null) {
  element?.scrollIntoView({block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth'})
}

/**
 * Takes the Writer to the thing blocking their publish: scrolls it into view and puts the caret
 * there, rather than listing errors.
 */
export function goToProblem(target: ProblemTarget, editor: Editor, openDetails: () => void) {
  if (target.kind === 'details') {
    openDetails()
    return
  }
  if (target.kind === 'title') {
    const title = document.querySelector<HTMLElement>('[data-calm-field="title"]')
    reveal(title)
    title?.focus({preventScroll: true})
    return
  }
  if (target.kind === 'body') {
    reveal(editor.dom.getEditorElement?.() ?? null)
    editor.send({type: 'focus'})
    return
  }

  const field = target.field
    ? document.querySelector<HTMLElement>(`[data-calm-field="${CSS.escape(`${target.key}.${target.field}`)}"]`)
    : null
  if (field) {
    reveal(field)
    field.focus({preventScroll: true})
    return
  }
  reveal(document.querySelector(`[data-calm-block="${CSS.escape(target.key)}"]`))
  editor.send({type: 'select.block', at: [{_key: target.key}], select: 'start'})
  editor.send({type: 'focus'})
}
