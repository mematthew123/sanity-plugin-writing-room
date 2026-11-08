import {useEffect} from 'react'

/**
 * Runs `onEscape` when the Writer presses Esc, unless something else (a dialog, a popover,
 * an IME composition) is using that keypress. In browser fullscreen, the browser takes the
 * first Esc to exit fullscreen, so leaving takes a second press.
 */
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
