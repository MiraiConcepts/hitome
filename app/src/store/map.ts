// Pure translation between Android's calendar store and the app's own shapes
// — no native imports, so it is tested under bun like caldav/ics.
import ICAL from 'ical.js';

import { applyRecurrence } from '@/caldav/rrule';
import type {
  AlarmInput,
  CalEvent,
  EventIcon,
  RecurrenceInput,
} from '@/caldav/types';

import type { StoreRow, StoreValues } from '../../modules/calendar-store';

const BIRTHDAY_NAME = /birthday/i;

/** A store event's handle, carried on CalEvent.url: `store:<calendar>/<id>`.
 *  Prefixed by the calendar's own url, so hiding a calendar (a prefix match
 *  on event urls) works as it does for CalDAV. */
export const calendarUrl = (calendarId: string | number) =>
  `store:${calendarId}/`;
export const eventUrl = (
  calendarId: string | number,
  eventId: string | number
) => `${calendarUrl(calendarId)}${eventId}`;

export function parseEventUrl(
  url: string
): { calendarId: string; eventId: string } | null {
  const match = /^store:(\d+)\/(\d+)$/.exec(url);
  return match ? { calendarId: match[1], eventId: match[2] } : null;
}
export function parseCalendarUrl(url: string): string | null {
  const match = /^store:(\d+)\/$/.exec(url);
  return match ? match[1] : null;
}

const num = (v: StoreRow[string]) =>
  typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
const str = (v: StoreRow[string]) =>
  typeof v === 'string' && v !== '' ? v : undefined;

/** An Android ARGB int as #RRGGBB. */
export function argbToHex(argb: StoreRow[string]): string | undefined {
  const n = num(argb);
  if (!Number.isFinite(n)) return undefined;
  return `#${((n >>> 0) & 0xffffff).toString(16).padStart(6, '0')}`;
}

export function calendarIcon(name: string): EventIcon | undefined {
  return BIRTHDAY_NAME.test(name) ? 'gift' : undefined;
}

/** A UTC-midnight timestamp (how the store keeps all-day days) as local
 *  midnight of the same date — what the grid means by that day. */
export function utcDayToLocal(ms: number): Date {
  const d = new Date(ms);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
/** Local midnight of a date as the store's UTC midnight. */
export function localDayToUtc(d: Date): number {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * A local wall-clock time (floating) or date. The store repeats a rule in the
 * event's own zone, so weekdays and the like are read and written in local
 * terms — a UTC DTSTART would put a Monday-morning series on Sunday.
 */
function localIcalTime(d: Date, allDay: boolean): ICAL.Time {
  return ICAL.Time.fromData({
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
    ...(allDay
      ? { isDate: true }
      : { hour: d.getHours(), minute: d.getMinutes(), second: d.getSeconds() }),
  });
}

/**
 * A minimal VCALENDAR for one store event: what the editor and the reminder
 * scheduler read (repeat rule, our alert), in the same ICS the CalDAV
 * backend hands them. `overridden` adds a stand-in exception so the repeat
 * reads as 'custom' — the editor will not rewrite a rule that per-occurrence
 * changes hang off, exactly as for a CalDAV object with overrides.
 */
export function synthesizeIcs(input: {
  uid: string;
  start: Date;
  allDay: boolean;
  rrule?: string;
  alarmMinutes?: number;
  overridden?: boolean;
}): string {
  const vcalendar = new ICAL.Component(['vcalendar', [], []]);
  vcalendar.updatePropertyWithValue('version', '2.0');
  vcalendar.updatePropertyWithValue('prodid', '-//hitome//store//EN');
  const vevent = new ICAL.Component('vevent');
  vevent.updatePropertyWithValue('uid', input.uid);
  const dtstart = localIcalTime(input.start, input.allDay);
  vevent.updatePropertyWithValue('dtstart', dtstart);
  if (input.rrule)
    vevent.updatePropertyWithValue('rrule', ICAL.Recur.fromString(input.rrule));
  if (input.alarmMinutes !== undefined) {
    const valarm = new ICAL.Component('valarm');
    valarm.addPropertyWithValue('action', 'DISPLAY');
    valarm.addPropertyWithValue(
      'trigger',
      ICAL.Duration.fromSeconds(-input.alarmMinutes * 60)
    );
    vevent.addSubcomponent(valarm);
  }
  vcalendar.addSubcomponent(vevent);
  if (input.rrule && input.overridden) {
    const stand = new ICAL.Component('vevent');
    stand.updatePropertyWithValue('uid', input.uid);
    stand.updatePropertyWithValue('recurrence-id', dtstart);
    stand.updatePropertyWithValue('dtstart', dtstart);
    vcalendar.addSubcomponent(stand);
  }
  return vcalendar.toString();
}

export type InstanceContext = {
  /** First reminder minutes per event id (series id for occurrences). */
  alarms: Map<string, number>;
  /** Series ids that have at least one exception row. */
  overridden: Set<string>;
};

/** One Instances row as a CalEvent. */
export function instanceToEvent(row: StoreRow, ctx: InstanceContext): CalEvent {
  const eventId = String(num(row.event_id));
  // The store hands ids back as numbers; a missing one is null.
  const originalId =
    row.original_id === null || row.original_id === undefined
      ? undefined
      : String(num(row.original_id));
  const seriesId = originalId ?? eventId;
  const calendarId = String(num(row.calendar_id));
  const allDay = num(row.allDay) === 1;
  const begin = num(row.begin);
  const end = num(row.end);
  const start = allDay ? utcDayToLocal(begin) : new Date(begin);
  const finish = allDay ? utcDayToLocal(end) : new Date(end);
  const rrule = str(row.rrule);
  const recurring = Boolean(rrule || originalId);
  const originalTime = num(row.originalInstanceTime);
  const recurrenceStart = recurring
    ? Math.floor((Number.isFinite(originalTime) ? originalTime : begin) / 1000)
    : undefined;
  const calendarName = str(row.calendar_displayName) ?? '';
  const color = argbToHex(row.displayColor ?? row.calendar_color);
  const icon = calendarIcon(calendarName);
  const alarmMinutes = ctx.alarms.get(eventId) ?? ctx.alarms.get(seriesId);
  const uid = `store-${seriesId}`;
  return {
    id: `${uid}:${Math.floor(begin / 1000)}`,
    url: eventUrl(calendarId, eventId),
    etag: originalId ? `series:${originalId}` : '',
    uid,
    summary: str(row.title) ?? '',
    start,
    end: finish,
    allDay,
    ...(str(row.eventLocation) ? { location: str(row.eventLocation) } : {}),
    ...(str(row.description) ? { description: str(row.description) } : {}),
    ...(recurring ? { recurring: true, recurrenceStart } : {}),
    ...(alarmMinutes !== undefined ? { alarm: true } : {}),
    ...(color ? { color } : {}),
    ...(icon ? { icon } : {}),
    raw: synthesizeIcs({
      uid,
      // The series start, so the editor reads the rule against what it
      // repeats from; an exception carries no rule and starts where it is.
      start: rrule
        ? allDay
          ? utcDayToLocal(num(row.dtstart))
          : new Date(num(row.dtstart))
        : start,
      allDay,
      rrule,
      alarmMinutes,
      overridden: ctx.overridden.has(seriesId),
    }),
  };
}

/** The series id behind a CalEvent from this backend: an exception's
 *  original, else the event itself. */
export function seriesIdOf(event: CalEvent): string {
  if (event.etag.startsWith('series:')) return event.etag.slice(7);
  return parseEventUrl(event.url)?.eventId ?? '';
}

/** An RFC 2445 duration the store accepts: days for all-day, seconds else. */
export function durationOf(start: Date, end: Date, allDay: boolean): string {
  if (allDay) {
    const days = Math.max(
      1,
      Math.round((localDayToUtc(end) - localDayToUtc(start)) / 86_400_000) + 1
    );
    return `P${days}D`;
  }
  return `P${Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000))}S`;
}

/** Milliseconds in a store DURATION ('P3600S', 'PT1H', 'P1D', 'P1W'). */
export function durationMs(duration: string | undefined): number {
  if (!duration) return 0;
  return ICAL.Duration.fromString(duration).toSeconds() * 1000;
}

/**
 * The store's time fields for a span: an all-day span as UTC midnights with
 * an exclusive end and the UTC zone (how the store keeps days); a timed one
 * in `zone`. A repeating event takes a DURATION instead of DTEND.
 */
export function timeValues(
  times: { start: Date; end: Date; allDay: boolean },
  repeating: boolean,
  zone: string
): StoreValues {
  const { start, end, allDay } = times;
  const dtstart = allDay ? localDayToUtc(start) : start.getTime();
  const dtend = allDay ? localDayToUtc(end) + 86_400_000 : end.getTime();
  return {
    allDay: allDay ? 1 : 0,
    dtstart,
    eventTimezone: allDay ? 'UTC' : zone,
    ...(repeating
      ? { dtend: null, duration: durationOf(start, end, allDay) }
      : { dtend, duration: null }),
  };
}

/** A preset as the store's RRULE text (no 'RRULE:' prefix), its weekdays
 *  and UNTIL type taken from the start like the CalDAV writer does. */
export function rruleFor(
  rec: RecurrenceInput,
  start: Date,
  allDay: boolean
): string {
  const vevent = new ICAL.Component('vevent');
  vevent.updatePropertyWithValue('dtstart', localIcalTime(start, allDay));
  applyRecurrence(vevent, rec);
  return (vevent.getFirstPropertyValue('rrule') as ICAL.Recur).toString();
}

/**
 * A rule cut to stop before the occurrence at `before` (ms): UNTIL the day
 * before (all-day) or one second before in UTC (timed); COUNT dropped, as
 * UNTIL and COUNT may not both appear.
 */
export function truncateRule(
  rrule: string,
  before: number,
  allDay: boolean
): string {
  const recur = ICAL.Recur.fromString(rrule);
  const data = recur.toJSON() as Record<string, unknown>;
  delete data.count;
  if (allDay) {
    const day = utcDayToLocal(before);
    day.setDate(day.getDate() - 1);
    data.until = ICAL.Time.fromData({
      year: day.getFullYear(),
      month: day.getMonth() + 1,
      day: day.getDate(),
      isDate: true,
    });
  } else {
    data.until = ICAL.Time.fromJSDate(new Date(before - 1000), true);
  }
  return ICAL.Recur.fromData(data).toString();
}

/** How many occurrences of a rule from `dtstart` come before `before` (ms)
 *  — what a split's COUNT is reduced by. */
export function firedBefore(
  rrule: string,
  dtstart: number,
  allDay: boolean,
  before: number
): number {
  const start = allDay
    ? ICAL.Time.fromData({
        ...(() => {
          const d = utcDayToLocal(dtstart);
          return {
            year: d.getFullYear(),
            month: d.getMonth() + 1,
            day: d.getDate(),
          };
        })(),
        isDate: true,
      })
    : ICAL.Time.fromJSDate(new Date(dtstart), true);
  const iterator = ICAL.Recur.fromString(rrule).iterator(start);
  const limit = allDay ? localDayToUtc(utcDayToLocal(before)) : before;
  let n = 0;
  for (let next = iterator.next(); next && n < 5000; next = iterator.next()) {
    const at = allDay
      ? Date.UTC(next.year, next.month - 1, next.day)
      : next.toJSDate().getTime();
    if (at >= limit) break;
    n++;
  }
  return n;
}

/** The rule with COUNT reduced by occurrences already past. */
export function remainingRule(rrule: string, fired: number): string {
  const recur = ICAL.Recur.fromString(rrule);
  if (!recur.count) return rrule;
  const data = recur.toJSON() as Record<string, unknown>;
  data.count = Math.max(1, recur.count - fired);
  return ICAL.Recur.fromData(data).toString();
}

/** Reminder rows for an alert (none for null). */
export function reminderValues(
  eventId: string,
  alarm: AlarmInput | null | undefined
): StoreValues[] {
  if (!alarm) return [];
  return [
    { event_id: Number(eventId), minutes: alarm.offsetMinutes, method: 1 },
  ];
}
