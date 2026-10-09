import { createContext, useContext } from 'react';

/** The three query params the widget can deep-link with. */
export type DeepLink = {
  /** `?day=YYYY-MM-DD` — land the grid on that day's month. */
  day: string | null;
  /** `?event=<CalEvent.id>` — additionally open that event. */
  event: string | null;
  /** `?new=<nonce>` — open the new-event editor (nonce so repeat taps re-fire). */
  new: string | null;
  /** Which arrival this is: it goes up with every link the app receives, so
   *  the same link twice (a widget row tapped again) is two arrivals, while a
   *  screen rebuilt within one arrival still sees the same number. */
  serial: number;
};

export const EMPTY_DEEP_LINK: DeepLink = {
  day: null,
  event: null,
  new: null,
  serial: 0,
};

const DeepLinkContext = createContext<DeepLink>(EMPTY_DEEP_LINK);

export const DeepLinkProvider = DeepLinkContext.Provider;

/**
 * The link this launch arrived on. Read from the Android intent directly rather
 * than from the router — see `use-deep-link-source.ts` for why.
 */
export function useDeepLink(): DeepLink {
  return useContext(DeepLinkContext);
}
