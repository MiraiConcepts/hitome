// Fetch→cache pipeline shared by the headless task handler and the app-side
// refresh: fresh data when the server answers, last-good snapshot otherwise.
import { ensureSource } from '@/config/source';

import { readWidgetCache, writeWidgetCache } from './cache';
import { fetchUpcoming } from './fetch-upcoming';
import type { WidgetCache } from './types';

export async function loadAgendaCache(): Promise<WidgetCache | null> {
  // The headless task runs in a fresh JS context with no React tree, so the
  // stored config has to be read here rather than inherited from the app.
  if (await ensureSource()) {
    try {
      const now = new Date();
      const cache: WidgetCache = {
        events: await fetchUpcoming(now),
        fetchedAt: now.toISOString(),
      };
      writeWidgetCache(cache);
      return cache;
    } catch {
      // Off-tailnet or server down — fall back to the last-good snapshot.
    }
  }
  return readWidgetCache();
}
