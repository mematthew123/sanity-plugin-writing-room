import {useEffect} from 'react'

const LAYER = '[role="dialog"], [data-ui="Popover"]'

/** Ignores an Esc that something else (a dialog, a popover, an IME composition) is using. */
export function useEscape(onEscape: () => void) {
  useEffect(() => {
    // An input can close its own popover while handling the key, so by the time the key reaches
    // the window there's nothing left to see. Look on the way down, before anything has handled it.
    let layerWasOpen = false
    function noteLayers(event: KeyboardEvent) {
      if (event.key === 'Escape') layerWasOpen = !!document.querySelector(LAYER)
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return
      if (layerWasOpen || document.querySelector(LAYER)) return
      onEscape()
    }
    window.addEventListener('keydown', noteLayers, true)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', noteLayers, true)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onEscape])
}
