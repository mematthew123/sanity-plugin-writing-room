/** Injects one CSS Module's rules, once (see tsdown.config.ts). */
export function addStyles(id: string, css: string): void {
  // Also evaluated on a server when the Studio is embedded.
  if (typeof document === 'undefined') return
  if (document.head.querySelector(`style[data-calm-styles="${id}"]`)) return
  const style = document.createElement('style')
  style.dataset.calmStyles = id
  style.textContent = css
  document.head.append(style)
}
