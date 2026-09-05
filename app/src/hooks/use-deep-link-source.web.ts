import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import type { DeepLink } from '@/hooks/use-deep-link';

/**
 * On web the router is the right source: the URL bar is the intent, a reload
 * builds a fresh runtime, and there is no memoized-initial-URL problem to work
 * around (see the native file). Ready immediately — the params are synchronous.
 */
export function useDeepLinkSource(): { link: DeepLink; ready: boolean } {
  const params = useLocalSearchParams<{
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
