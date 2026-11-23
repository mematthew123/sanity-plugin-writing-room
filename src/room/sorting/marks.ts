import {inKeyOrder} from './apply'

/**
 * Which Details fields Sorting filled, so each can say "From your paste" until the Writer changes
 * it. Kept only in memory and only for the visit: nothing about it is stored in the document.
 */
const filledBySorting = new Map<string, Map<string, string>>()

// A save can hand a reference back with its keys in another order.
const sameAs = (value: unknown) => JSON.stringify(inKeyOrder(value ?? null))

export const sortingMarks = {
  /** `values`: each filled field and what Sorting put in it. */
  set(documentId: string, values: Record<string, unknown>) {
    filledBySorting.set(documentId, new Map(Object.entries(values).map(([field, value]) => [field, sameAs(value)])))
  },
  clear(documentId: string) {
    filledBySorting.delete(documentId)
  },
  /** True while the field still holds exactly what Sorting put there. */
  has(documentId: string | null, field: string, value: unknown): boolean {
    if (!documentId) return false
    const marked = filledBySorting.get(documentId)?.get(field)
    return marked !== undefined && marked === sameAs(value)
  },
}
