import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { runAlarmReconcile } from '@/alarms/runner';
import { onAlarmTap } from '@/alarms/scheduler';
import { subscribeStore } from '@/data/events';
import { openInApp } from '@/hooks/use-deep-link-source';

// Deferred past boot for the same reason as the widget refresh in _layout —
// don't compete with startup allocations; alarms tolerate an 8s lag.
const BOOT_DELAY_MS = 8000;
const MIN_INTERVAL_MS = 5000;

/**
 * App-lifecycle alarm reconciliation (mount + return-to-foreground) and the
 * reminder tap → that event, the same way a widget link opens one. Lives in the root layout so it runs
 * app-wide, independent of which route is mounted.
 */
export function useAlarmReconcile(): void {
  const lastRun = useRef(0);

  useEffect(() => {
    function kick() {
      const now = Date.now();
      if (now - lastRun.current < MIN_INTERVAL_MS) return;
      lastRun.current = now;
      runAlarmReconcile();
    }

    const timer = setTimeout(kick, BOOT_DELAY_MS);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') kick();
    });
    // A reminder tap opens its event (the month view lands on the day, then
    // opens it once fetched) — the widget's links take the same path.
    const untap = onAlarmTap(openInApp);
    // Android: a sync landing in the phone's calendar store can add, move or
    // drop reminders — reconcile once the burst of writes settles.
    let settle: ReturnType<typeof setTimeout> | null = null;
    const unwatch = subscribeStore(() => {
      if (settle) clearTimeout(settle);
      settle = setTimeout(kick, 2000);
    });
    return () => {
      clearTimeout(timer);
      if (settle) clearTimeout(settle);
      appState.remove();
      untap();
      unwatch();
    };
  }, []);
}
