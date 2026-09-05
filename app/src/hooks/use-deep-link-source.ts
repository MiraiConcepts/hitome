import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';

import { EMPTY_DEEP_LINK, type DeepLink } from '@/hooks/use-deep-link';

function first(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function parseDeepLink(url: string | null): DeepLink {
  if (!url) return EMPTY_DEEP_LINK;
  const query = Linking.parse(url).queryParams ?? {};
  return {
    day: first(query.day),
    event: first(query.event),
    new: first(query.new),
  };
}

/**
 * The launch URL, read from the Android intent — deliberately NOT from
 * expo-router's `useLocalSearchParams`.
 *
 * Every widget tap destroys and recreates MainActivity but leaves the process
 * (and so the JS runtime) alive. The React tree remounts on the new surface,
 * but expo-router's linking config memoizes its initial URL in a closure that
 * outlives the remount:
 *
 *     let hasCachedInitialUrl = false;         // expo-router/build/getLinkingConfig.js
 *     getInitialURL() { if (!hasCachedInitialUrl) { ... } return initialUrl; }
 *
 * So the router reports the FIRST link the runtime ever saw, forever after —
 * measured 2026-09-05: Android delivered `?day=2026-09-24`, `getInitialURL()`
 * returned `?day=2026-09-24`, and `useLocalSearchParams` still said
 * `?day=2026-09-21`. Every widget row appeared to open the same event.
 * `Linking.getInitialURL()` is not memoized, and re-reading it per mount is
 * correct precisely because the mount is what a new intent causes.
 *
 * `ready` is false until that first read lands, because the callers seed
 * `useState` from the link: a render on the wrong link is a wrong event opened,
 * not merely a wrong frame. Boot already holds a spinner for fonts and
 * hydration, so this hides inside it.
 */
export function useDeepLinkSource(): { link: DeepLink; ready: boolean } {
  const [state, setState] = useState<{ link: DeepLink; ready: boolean }>({
    link: EMPTY_DEEP_LINK,
    ready: false,
  });

  useEffect(() => {
    // Reading the intent IS the synchronization with an external system, and
    // both channels matter: getInitialURL covers a link that launched this
    // activity, the `url` event covers one delivered to a live one (onNewIntent,
    // when the task was still in the background rather than finished).
    let alive = true;
    const settle = (url: string | null) => {
      if (alive) setState({ link: parseDeepLink(url), ready: true });
    };
    Linking.getInitialURL().then(settle, () => settle(null));
    const subscription = Linking.addEventListener('url', ({ url }) =>
      settle(url)
    );
    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);

  return state;
}
