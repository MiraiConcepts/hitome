/** Escape steps back one level on the web; a phone has no such key (the
 *  Android back button is handled where it is needed). Web twin:
 *  use-escape-key.web.ts. */
export function useEscapeKey(
  _onEscape: () => void,
  _enabled: boolean = true
): void {}
