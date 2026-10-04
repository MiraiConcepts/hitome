import { router, useGlobalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import type { DeepLink } from '@/hooks/use-deep-link';

/** Open a day (and event) in the app — on web, by navigating there. */
export function openInApp(target: { day: string; event?: string }): void {
  router.navigate({
    pathname: '/',
    params: target.event
      ? { day: target.day, event: target.event }
      : { day: target.day },
  });
}

/**
 * On web the router is the right source: the URL bar is the intent, a reload
 * builds a fresh runtime, and there is no memoized-initial-URL problem to work
 * around (see the native file). Ready immediately — the params are synchronous.
 */
export function useDeepLinkSource(): { link: DeepLink; ready: boolean } {
  // Global, not local: this runs in the root layout, whose own (local) params
  // never include the page's query — `?day=` read as nothing, and the grid
  // opened on today whatever the link said.
  const params = useGlobalSearchParams<{
    day?: string;
    event?: string;
    new?: string;
  }>();
  const day = typeof params.day === 'string' ? params.day : null;
  const event = typeof params.event === 'string' ? params.event : null;
  const created = typeof params.new === 'string' ? params.new : null;
  const link = useMemo(
    () => ({ day, event, new: created }),
    [day, event, created]
  );
  return { link, ready: true };
}
