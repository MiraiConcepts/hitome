// Pure editor-form state logic (no React/RN imports — bun-testable): prefill
// from a CalEvent and the equality checks the diff-based save relies on.
import { readRecurrence } from '@/caldav/rrule';
import type { CalEvent } from '@/caldav/types';
import { readAlarm } from '@/caldav/valarm';
import type { AlarmState } from '@/components/calendar/alarm-field';
import type { RecurrenceState } from '@/components/calendar/recurrence-field';
import {
  addDays,
  nextFullHour,
  parseDay,
  toDateString,
  toTimeString,
} from '@/utils/date';

export type FormState = {
  summary: string;
  allDay: boolean;
  startDay: string;
  startTime: string;
  endDay: string;
  endTime: string;
  location: string;
  description: string;
  recurrence: RecurrenceState;
  alarm: AlarmState;
};

/** Pure prefill for the editor form (create when event is null). */
export function initialFormState(
  event: CalEvent | null,
  defaultDay: string,
  now: Date = new Date(),
  /** A new event's alert, from settings (minutes before; null for none). */
  defaultAlert: number | null = null
): FormState {
  const defaultStart = nextFullHour(now);
  const defaultEnd = new Date(defaultStart);
  defaultEnd.setHours(defaultEnd.getHours() + 1);

  if (!event) {
    const startDay = toDateString(parseDay(defaultDay) ?? now);
    return {
      summary: '',
      allDay: false,
      startDay,
      startTime: toTimeString(defaultStart),
      endDay: startDay,
      endTime: toTimeString(defaultEnd),
      location: '',
      description: '',
      recurrence: { kind: 'none' },
      alarm:
        defaultAlert === null
          ? { kind: 'none' }
          : { kind: 'set', offsetMinutes: defaultAlert },
    };
  }

  const startDay = toDateString(event.start);
  // All-day CalEvent.end is the exclusive DTEND — show the inclusive day.
  const endDay = event.allDay
    ? (() => {
        const inclusive = addDays(toDateString(event.end), -1);
        return inclusive < startDay ? startDay : inclusive;
      })()
    : toDateString(event.end);

  const read = readRecurrence(event.raw);
  const recurrence: RecurrenceState =
    read === null
      ? { kind: 'none' }
      : read === 'custom'
        ? { kind: 'custom' }
        : {
            kind: 'preset',
            preset: read.preset,
            end: read.count
              ? { type: 'count', n: read.count }
              : read.until
                ? { type: 'until', day: toDateString(read.until) }
                : { type: 'forever' },
          };

  const readAlarmResult = readAlarm(event.raw);
  const alarm: AlarmState =
    readAlarmResult === null
      ? { kind: 'none' }
      : readAlarmResult === 'foreign'
        ? { kind: 'foreign' }
        : { kind: 'set', offsetMinutes: readAlarmResult.offsetMinutes };

  return {
    summary: event.summary,
    allDay: event.allDay,
    startDay,
    startTime: event.allDay
      ? toTimeString(defaultStart)
      : toTimeString(event.start),
    endDay,
    endTime: event.allDay ? toTimeString(defaultEnd) : toTimeString(event.end),
    location: event.location ?? '',
    description: event.description ?? '',
    recurrence,
    alarm,
  };
}

export function recurEqual(a: RecurrenceState, b: RecurrenceState): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind !== 'preset' || b.kind !== 'preset') return true;
  if (a.preset !== b.preset || a.end.type !== b.end.type) return false;
  if (a.end.type === 'until' && b.end.type === 'until')
    return a.end.day === b.end.day;
  if (a.end.type === 'count' && b.end.type === 'count')
    return a.end.n === b.end.n;
  return true;
}

export function alarmEqual(a: AlarmState, b: AlarmState): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'set' && b.kind === 'set')
    return a.offsetMinutes === b.offsetMinutes;
  return true;
}
