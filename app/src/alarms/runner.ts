// The reconcile loop: derive desired alarms for the next 14 days and bring
// the platform's scheduled set in line. Runs on app start, foreground, and
// after every editor write — the "reconcile on open" cadence is also the
// safety net against ColorOS force-stops wiping AlarmManager registrations.
import { Platform } from 'react-native';

import type { CalEvent } from '@/caldav/types';
import { ensureSource } from '@/config/source';
import { fetchMonth } from '@/data/events';
import { cacheKey } from '@/hooks/use-month-events';
import { reviveEvents } from '@/utils/event-snapshot';
import { monthKeyOf } from '@/utils/month-events-store';
import { readSnapshot } from '@/utils/snapshot-cache';

import { desiredAlarms, HORIZON_MS } from './occurrences';
import { planReconcile } from './reconcile';
import {
  cancelAlarm,
  ensureSetup,
  listScheduledAlarmIds,
  scheduleAlarm,
} from './scheduler';

/** Offline fallback: horizon events from the month buckets' disk snapshots. */
async function eventsFromSnapshots(now: Date, end: Date): Promise<CalEvent[]> {
  const months: { year: number; month0: number }[] = [];
  const cursor = new Date(now.getFullYear(), now.getMonth(), 1);
  while (cursor <= end) {
    months.push({ year: cursor.getFullYear(), month0: cursor.getMonth() });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  const events: CalEvent[] = [];
  for (const { year, month0 } of months) {
    const snapshot = await readSnapshot<unknown>(
      cacheKey(monthKeyOf(year, month0))
    );
    if (!snapshot) continue;
    const revived = reviveEvents(snapshot);
    if (revived) events.push(...revived);
  }
  return events;
}

let running: Promise<void> | null = null;

/** Coalesced full reconcile — concurrent callers share one run. */
export function runAlarmReconcile(): Promise<void> {
  if (running) return running;
  running = (async () => {
    try {
      // Logged out on the web there is nothing to remind of, and asking the
      // calendar anyway only drew refusals from the server.
      if (Platform.OS === 'web' && !(await ensureSource())) return;
      await ensureSetup();
      const now = new Date();
      const end = new Date(now.getTime() + HORIZON_MS);
      let events: CalEvent[];
      try {
        events = await fetchMonth(now, end);
      } catch {
        events = await eventsFromSnapshots(now, end);
      }
      const plan = planReconcile(
        desiredAlarms(events, now),
        await listScheduledAlarmIds()
      );
      for (const id of plan.toCancel) await cancelAlarm(id);
      for (const alarm of plan.toSchedule) await scheduleAlarm(alarm);
    } catch {
      // Best-effort by design: the next foreground/save reconcile retries.
    } finally {
      running = null;
    }
  })();
  return running;
}
