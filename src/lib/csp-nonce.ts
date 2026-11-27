declare const __webpack_nonce__: string | undefined

/**
 * The nonce a Content Security Policy asks of a `<style>`, where the page states one: in
 * `<meta property="csp-nonce">`, or webpack's `__webpack_nonce__`. The same places the Studio's
 * own styling looks, so the room's styles are let through wherever the Studio's are.
 */
export function cspNonce(): string | undefined {
  if (typeof document === 'undefined') return undefined
  const meta = document.head.querySelector<HTMLMetaElement>('meta[property="csp-nonce"]')
  const stated = meta?.nonce || meta?.getAttribute('content')
  if (stated) return stated
  return typeof __webpack_nonce__ === 'undefined' ? undefined : __webpack_nonce__
}
