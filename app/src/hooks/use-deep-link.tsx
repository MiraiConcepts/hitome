import { createContext, useContext } from 'react';

/** The three query params the widget can deep-link with. */
export type DeepLink = {
  /** `?day=YYYY-MM-DD` — land the grid on that day's month. */
  day: string | null;
  /** `?event=<CalEvent.id>` — additionally open that event. */
  event: string | null;
  /** `?new=<nonce>` — open the new-event editor (nonce so repeat taps re-fire). */
  new: string | null;
};

export const EMPTY_DEEP_LINK: DeepLink = { day: null, event: null, new: null };

const DeepLinkContext = createContext<DeepLink>(EMPTY_DEEP_LINK);

export const DeepLinkProvider = DeepLinkContext.Provider;

/**
 * The link this launch arrived on. Read from the Android intent directly rather
 * than from the router — see `use-deep-link-source.ts` for why.
 */
export function useDeepLink(): DeepLink {
  return useContext(DeepLinkContext);
}
