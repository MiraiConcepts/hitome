import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { runAlarmReconcile } from '@/alarms/runner';
import { onAlarmTap } from '@/alarms/scheduler';

// Deferred past boot for the same reason as the widget refresh in _layout —
// don't compete with startup allocations; alarms tolerate an 8s lag.
const BOOT_DELAY_MS = 8000;
const MIN_INTERVAL_MS = 5000;

/**
 * App-lifecycle alarm reconciliation (mount + return-to-foreground) and the
 * notification-tap → `?day=` deep link. Lives in the root layout so it runs
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
    const untap = onAlarmTap((day) => {
      // month-screen already understands ?day= (same path as the e2e deep
      // links) and centers the grid on it.
      router.navigate({ pathname: '/', params: { day } });
    });
    return () => {
      clearTimeout(timer);
      appState.remove();
      untap();
    };
  }, []);
}
