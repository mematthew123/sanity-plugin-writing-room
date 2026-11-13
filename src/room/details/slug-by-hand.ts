/**
 * The slug as the Writer last typed it in Details, by document. Details saves through the Studio's
 * store, so for a moment the title (which saves through the App SDK) still sees the slug as it was
 * and would take it for one that follows the title. This is the slug it should go by until then.
 */
const typed = new Map<string, string>()

export const slugByHand = {
  /** An emptied slug is noted too: it means "follow the title again". */
  note: (documentId: string, slug: string) => void typed.set(documentId, slug),
  read: (documentId: string): string | undefined => typed.get(documentId),
  /** Once the title has written the slug itself, what was typed is history. */
  forget: (documentId: string) => void typed.delete(documentId),
}
