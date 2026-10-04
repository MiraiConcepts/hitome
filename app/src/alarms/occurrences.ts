// Pure derivation: expanded CalEvents → the alarms that should currently be
// scheduled. No RRULE triggers exist on Android, so recurrence is handled by
// scheduling each concrete occurrence inside a rolling horizon; every
// sync/foreground re-derives and reconciles.
import type { CalEvent } from '@/caldav/types';
import { alarmTimeFor } from '@/caldav/valarm';
import { formatTime, toDateString } from '@/utils/date';
import { findMeetingLink } from '@/widget/meeting-link';

export type DesiredAlarm = {
  /** Deterministic: alarm:{uid}:{occStartEpochSec} — re-scheduling replaces. */
  id: string;
  fireDate: Date;
  title: string;
  body: string;
  /** The occurrence's local day — notification tap deep-links here. */
  day: string;
  /** CalEvent.id — a tap opens this event, not just its day. */
  event: string;
  /** The event's meeting link, if it has one — the notification's Join. */
  join?: string;
};

export const ALARM_ID_PREFIX = 'alarm:';
export const HORIZON_MS = 14 * 24 * 60 * 60 * 1000;

const join = (event: CalEvent) => findMeetingLink(event);

function timeLabel(event: CalEvent): string {
  if (event.allDay) return 'All day';
  return formatTime(event.start);
}

/**
 * Alarms to schedule from the given (already-expanded) events: one per
 * occurrence with an editable VALARM whose fire time is still in the future
 * and whose occurrence starts within the horizon. Absolute-trigger/foreign
 * alarms are skipped (other clients own those).
 */
export function desiredAlarms(
  events: readonly CalEvent[],
  now: Date,
  horizonMs: number = HORIZON_MS
): DesiredAlarm[] {
  const horizonEnd = now.getTime() + horizonMs;
  const out: DesiredAlarm[] = [];
  const seen = new Set<string>();
  for (const event of events) {
    if (!event.alarm) continue;
    if (event.start.getTime() > horizonEnd) continue;
    const fireDate = alarmTimeFor(event.raw, event.start);
    if (!fireDate || fireDate.getTime() <= now.getTime()) continue;
    const id = `${ALARM_ID_PREFIX}${event.uid}:${Math.floor(event.start.getTime() / 1000)}`;
    if (seen.has(id)) continue; // overlapping fetches can repeat occurrences
    seen.add(id);
    out.push({
      id,
      fireDate,
      title: event.summary || 'Event',
      body: event.location
        ? `${timeLabel(event)} · ${event.location}`
        : timeLabel(event),
      day: toDateString(event.start),
      event: event.id,
      ...(join(event) ? { join: join(event) } : {}),
    });
  }
  return out.sort((a, b) => a.fireDate.getTime() - b.fireDate.getTime());
}
