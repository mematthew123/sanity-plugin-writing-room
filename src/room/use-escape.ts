import {useEffect} from 'react'

/** Ignores an Esc that something else (a dialog, a popover, an IME composition) is using. */
export function useEscape(onEscape: () => void) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return
      if (document.querySelector('[role="dialog"], [data-ui="Popover"]')) return
      onEscape()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onEscape])
}
