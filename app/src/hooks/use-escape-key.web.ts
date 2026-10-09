import { useEffect, useRef } from 'react';

/**
 * Escape steps back one level: closes what is open, or leaves the screen. The
 * handler may change every render; the listener is added once. Left alone
 * while an input method is composing text, and with any modifier held.
 */
export function useEscapeKey(onEscape: () => void, enabled: boolean = true) {
  const latest = useRef({ onEscape, enabled });
  useEffect(() => {
    latest.current = { onEscape, enabled };
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing) return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (!latest.current.enabled) return;
      e.preventDefault();
      latest.current.onEscape();
    };
    // Capture phase: a focused field inside a sheet can stop the key before it
    // bubbles up to the window.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
}
