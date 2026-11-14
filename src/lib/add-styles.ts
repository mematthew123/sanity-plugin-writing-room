/**
 * Puts one CSS Module's rules on the page, once. The build calls this from each `.module.css` it
 * compiles (see tsdown.config.ts), so a Studio needs no CSS loader; in `sanity dev`, Vite does it.
 */
export function addStyles(id: string, css: string): void {
  // The plugin's modules are also evaluated on a server when the Studio is embedded.
  if (typeof document === 'undefined') return
  if (document.head.querySelector(`style[data-calm-styles="${id}"]`)) return
  const style = document.createElement('style')
  style.dataset.calmStyles = id
  style.textContent = css
  document.head.append(style)
}
