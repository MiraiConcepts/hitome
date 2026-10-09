import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import {
  fetchMonth,
  isAuthFailure,
  requestSync,
  subscribeStore,
} from '@/data/events';
import type { CalEvent } from '@/caldav/types';
import { getSourceStatus, useSourceStatus } from '@/config/source';
import { gridFetchRange } from '@/utils/calendar-grid';
import { reviveEvents, serializeEvents } from '@/utils/event-snapshot';
import {
  applyFetch,
  applySeed,
  isFresh,
  mergeEvents,
  monthKeyOf,
  type MonthStore,
} from '@/utils/month-events-store';
import { readSnapshot, writeSnapshot } from '@/utils/snapshot-cache';
import { refreshAgendaWidget } from '@/widget/app-refresh';

/** Poll cadence while the view is actually visible (zero network when hidden). */
const POLL_VISIBLE_MS = 60_000;

/** A bucket fetched within this window is skipped by prefetch (the poll and
 *  settle paths still refetch the settled month unconditionally). */
const PREFETCH_FRESH_MS = POLL_VISIBLE_MS;

/** Prefetch waves around the settled month: ±1 first, then ±2. */
const PREFETCH_WAVES: readonly (readonly number[])[] = [
  [-1, 1],
  [-2, 2],
];

/** Snapshot-cache key for a month bucket — shared with the alarm runner's
 * cold-start fallback (src/alarms/runner.ts). */
export const cacheKey = (monthKey: string) => `calendar-${monthKey}`;

function monthDelta(
  year: number,
  month0: number,
  delta: number
): { year: number; month0: number } {
  const date = new Date(year, month0 + delta, 1);
  return { year: date.getFullYear(), month0: date.getMonth() };
}

/**
 * Accumulating stale-while-revalidate month store: every month ever fetched
 * (or seeded from its last-good snapshot) stays in memory, so paging between
 * months never blanks chips that were already on screen. A settled month
 * fetches its full 6-row grid viewport (± a week of slack) as before, then
 * ±1 and ±2 months prefetch in the background — with one-month paging the
 * destination is always loaded before it can be reached. The server stays
 * the source of truth: a landed fetch replaces its month's bucket and prunes
 * server-deleted events from overlapping buckets (see month-events-store);
 * the cache only ever costs freshness.
 */
export function useMonthEvents(visibleMonth: Date) {
  const [store, setStore] = useState<MonthStore<CalEvent>>(() => new Map());
  /** When the server last answered — the freshness stamp both the header and
   *  the widget show. Only a landed fetch moves it; a failure leaves the last
   *  good time standing, which is what makes it meaningful when offline. */
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  // 'loading' until the stored config lands, so the first paint is a spinner
  // rather than a claim either way.
  const status = useSourceStatus();
  const [loading, setLoading] = useState(status !== 'unconfigured');
  const [error, setError] = useState<string | null>(null);
  /** The last failure was the server refusing the login, not the network being
   *  unreachable. Separate because the fix is — go to settings, not wait. */
  const [authFailed, setAuthFailed] = useState(false);
  // Guards loading/error against out-of-order settled-month fetches; landed
  // data is always applied (it's authoritative for its own month regardless).
  const seq = useRef(0);
  const inflight = useRef(new Set<string>());
  // Mirror for freshness/presence checks from async fetch paths; the checks
  // tolerate the one-commit lag of an effect-synced ref.
  const storeRef = useRef(store);
  useEffect(() => {
    storeRef.current = store;
  }, [store]);

  const year = visibleMonth.getFullYear();
  const month0 = visibleMonth.getMonth();

  const seedFromSnapshot = useCallback((monthKey: string) => {
    readSnapshot(cacheKey(monthKey)).then((snapshot) => {
      if (snapshot == null) return;
      const cached = reviveEvents(snapshot);
      // applySeed no-ops if a fetch landed while the read was in flight.
      if (cached) setStore((prev) => applySeed(prev, monthKey, cached));
    });
  }, []);

  /** Fetch one month's grid window into its bucket. `primary` (the settled
   *  month) drives the loading/error UI; prefetches are silent and skipped
   *  when the bucket is already fresh. */
  const fetchMonthInto = useCallback(
    async (y: number, m0: number, primary: boolean) => {
      // Read through the store rather than closing over the hook's value:
      // this callback is memoized and the config can land after it is made.
      if (getSourceStatus() !== 'configured') return;
      const monthKey = monthKeyOf(y, m0);
      if (!primary) {
        if (inflight.current.has(monthKey)) return;
        if (isFresh(storeRef.current, monthKey, Date.now(), PREFETCH_FRESH_MS))
          return;
      }
      // Instant paint from the last-good snapshot while the network answers.
      if (!storeRef.current.has(monthKey)) seedFromSnapshot(monthKey);
      const ticket = primary ? ++seq.current : 0;
      // Deliberately NOT clearing the error here. The banner it drives sits in
      // the grid's measured flow, so unmounting it for the duration of every
      // request resized the grid pane, changed rowHeight (pane ÷ 6) and forced
      // the whole week ribbon to re-lay-out — visible as a blank grid on each
      // retry and each 60s poll while offline. The last error stands until a
      // fetch actually succeeds, exactly as fetchedAt already does.
      if (primary) setLoading(true);
      inflight.current.add(monthKey);
      try {
        const range = gridFetchRange(y, m0);
        // Stamped when asked, not when answered: a poll or prefetch that
        // went out before a save or delete and lands after the refresh that
        // followed it is older, and applyFetch keeps it from undoing that.
        const requestedAt = Date.now();
        const result = await fetchMonth(range.start, range.end);
        setStore((prev) =>
          applyFetch(prev, monthKey, range, result, requestedAt)
        );
        setFetchedAt(new Date());
        if (primary && seq.current === ticket) {
          setError(null);
          setAuthFailed(false);
        }
        writeSnapshot(cacheKey(monthKey), serializeEvents(result));
      } catch (err) {
        if (primary && seq.current === ticket) {
          setAuthFailed(isAuthFailure(err));
          setError(
            err instanceof Error
              ? err.message
              : 'Could not reach the calendar server'
          );
        }
      } finally {
        inflight.current.delete(monthKey);
        if (primary && seq.current === ticket) setLoading(false);
      }
    },
    [seedFromSnapshot]
  );

  const refresh = useCallback(
    () => fetchMonthInto(year, month0, true),
    [fetchMonthInto, year, month0]
  );

  useEffect(() => {
    // Fetching on mount and on month change IS the synchronization with the
    // external system (Radicale); prefetch waves follow so adjacent months are
    // already in memory when a swipe lands on them. A month change mid-wave
    // stops further waves (the new settle restarts them re-centered).
    let cancelled = false;
    (async () => {
      await fetchMonthInto(year, month0, true);
      for (const wave of PREFETCH_WAVES) {
        if (cancelled) return;
        await Promise.all(
          wave.map((delta) => {
            const target = monthDelta(year, month0, delta);
            return fetchMonthInto(target.year, target.month0, false);
          })
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchMonthInto, year, month0]);

  useEffect(() => {
    // External writers (Apple Calendar, Etar, another tab) have no push channel
    // to us — decided: no WebSocket, HTTP pull only (widget plan §Field
    // debugging). So an open view revalidates on return-to-foreground and polls
    // gently while visible; hidden/backgrounded costs zero network. On web,
    // AppState maps to the Page Visibility API via react-native-web.
    if (status !== 'configured') return;
    let interval: ReturnType<typeof setInterval> | null = null;

    const stopPolling = () => {
      if (interval) clearInterval(interval);
      interval = null;
    };
    const startPolling = () => {
      stopPolling();
      interval = setInterval(refresh, POLL_VISIBLE_MS);
    };

    let lastRevalidate = 0;
    const revalidate = () => {
      // Focus + visibility can fire together on one return — refetch once.
      if (Date.now() - lastRevalidate < 5_000) return;
      lastRevalidate = Date.now();
      refresh();
      refreshAgendaWidget(); // foreground = the reliable widget trigger (no-op off-Android)
      // Android: the store only learns of other devices' edits when the sync
      // app next looks, which can be hours; coming to the front asks it to
      // look now, and what lands redraws through subscribeStore. (Web: no-op.)
      requestSync().catch(() => {});
    };

    const onAppStateChange = (state: AppStateStatus) => {
      if (state === 'active') {
        revalidate();
        startPolling();
      } else {
        stopPolling();
      }
    };

    startPolling(); // mounted views start visible; the initial fetch is the effect above
    const subscription = AppState.addEventListener('change', onAppStateChange);
    // macOS Spaces/desktop switches never mark the tab hidden (no visibility
    // event) but do blur/focus the window — revalidate on focus too.
    const onWindowFocus = () => revalidate();
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      window.addEventListener('focus', onWindowFocus);
    }
    return () => {
      stopPolling();
      subscription.remove();
      if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        window.removeEventListener('focus', onWindowFocus);
      }
    };
  }, [refresh, status]);

  useEffect(() => {
    // A cold open is a return to the front too (revalidate covers the
    // rest). Its own effect: the polling one re-runs on every month change.
    if (status === 'configured') requestSync().catch(() => {});
  }, [status]);

  useEffect(() => {
    // Android: the phone's calendar store says when it changed — a sync
    // landing, or another app's edit — so the grid and the widget follow
    // at once rather than at the next poll. Debounced: a
    // sync writes many rows in a burst. (The web has no store; a no-op.)
    // Reminders follow the store in useAlarmReconcile.
    if (status !== 'configured') return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribeStore(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        refresh();
        refreshAgendaWidget();
      }, 600);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [refresh, status]);

  const events = useMemo(() => mergeEvents(store), [store]);

  return { events, loading, error, authFailed, refresh, fetchedAt };
}
