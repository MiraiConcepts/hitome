// RRULE preset write/read — pure ical.js logic, no transport imports (testable
// offline, same rule as ics.ts). Presets deliberately cover the common cases;
// anything richer reads as 'custom' and is NEVER rewritten (foreign rules must
// survive byte-identical).
import ICAL from 'ical.js';

import type { RecurrenceInput, RecurrencePreset } from './types';

/** ICAL weekday codes indexed by JS getDay() order (0 = Sunday). */
const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

const PRESET_FREQ: Record<RecurrencePreset, string> = {
  daily: 'DAILY',
  weekdays: 'WEEKLY',
  weekly: 'WEEKLY',
  monthly: 'MONTHLY',
  yearly: 'YEARLY',
};

/**
 * BYDAY set meaning "local Mon–Fri" for this DTSTART. BYDAY evaluates in
 * DTSTART's own zone, and our timed writes are UTC — so an 07:00 SGT event
 * lives on the previous UTC day and the whole set must rotate with it
 * (delta from the stored weekday vs the local weekday of the same instant).
 */
export function weekdaysByday(dtstart: ICAL.Time): string[] {
  const storedIdx = dtstart.dayOfWeek() - 1; // 1=SU..7=SA → 0..6
  const localIdx = dtstart.toJSDate().getDay();
  const delta = (((storedIdx - localIdx) % 7) + 7) % 7;
  return [1, 2, 3, 4, 5].map((local) => WEEKDAY_CODES[(local + delta) % 7]);
}

/** UNTIL must match DTSTART's value type (RFC 5545). Inclusive of `until`'s day. */
function untilTime(until: Date, allDay: boolean): ICAL.Time {
  if (allDay) {
    return new ICAL.Time(
      {
        year: until.getFullYear(),
        month: until.getMonth() + 1,
        day: until.getDate(),
        isDate: true,
      },
      ICAL.Timezone.localTimezone
    );
  }
  // Timed: local end-of-day → UTC, so the final local-day occurrence is kept
  // on either side of UTC.
  return ICAL.Time.fromJSDate(
    new Date(
      until.getFullYear(),
      until.getMonth(),
      until.getDate(),
      23,
      59,
      59
    ),
    true
  );
}

/**
 * Write (or remove, with null) the VEVENT's RRULE from a preset. Must run
 * AFTER any DTSTART change — the weekdays rotation and UNTIL value type are
 * derived from the DTSTART already in the tree.
 */
export function applyRecurrence(
  vevent: ICAL.Component,
  rec: RecurrenceInput | null
): void {
  if (rec === null) {
    vevent.removeProperty('rrule');
    return;
  }
  const dtstart = vevent.getFirstPropertyValue('dtstart') as ICAL.Time | null;
  const data: Record<string, unknown> = { freq: PRESET_FREQ[rec.preset] };
  if (rec.preset === 'weekdays' && dtstart) {
    data.byday = weekdaysByday(dtstart);
  }
  if (rec.count) {
    data.count = rec.count;
  } else if (rec.until) {
    data.until = untilTime(rec.until, Boolean(dtstart?.isDate));
  }
  vevent.updatePropertyWithValue('rrule', ICAL.Recur.fromData(data));
}

/** The series master (no RECURRENCE-ID); falls back to the first VEVENT. */
export function masterVevent(vcalendar: ICAL.Component): ICAL.Component | null {
  const vevents = vcalendar.getAllSubcomponents('vevent');
  return (
    vevents.find((v) => !v.hasProperty('recurrence-id')) ?? vevents[0] ?? null
  );
}

const PLAIN_BYDAY = /^(SU|MO|TU|WE|TH|FR|SA)$/;

/**
 * Read an object's recurrence into editor state. 'custom' = real but beyond
 * our presets (or the object carries per-occurrence overrides) — the editor
 * renders it read-only and never writes a recurrence change for it.
 */
export function readRecurrence(ics: string): RecurrenceInput | 'custom' | null {
  const vcalendar = new ICAL.Component(ICAL.parse(ics));
  const vevent = masterVevent(vcalendar);
  if (!vevent) return null;

  const rrules = vevent.getAllProperties('rrule');
  if (rrules.length === 0) return null;

  // Sibling overrides: rewriting the series rule could orphan them.
  const hasOverrides = vcalendar
    .getAllSubcomponents('vevent')
    .some((v) => v.hasProperty('recurrence-id'));
  if (
    rrules.length > 1 ||
    hasOverrides ||
    vevent.hasProperty('exrule') ||
    vevent.hasProperty('rdate')
  ) {
    return 'custom';
  }

  const recur = vevent.getFirstPropertyValue('rrule') as ICAL.Recur;
  if (recur.interval > 1) return 'custom';

  const partKeys = Object.keys(recur.parts ?? {});
  const byday: string[] = (recur.parts?.BYDAY as string[]) ?? [];
  if (partKeys.some((k) => k !== 'BYDAY')) return 'custom';
  if (byday.some((d) => !PLAIN_BYDAY.test(d))) return 'custom';

  let preset: RecurrencePreset;
  if (recur.freq === 'DAILY' && byday.length === 0) preset = 'daily';
  else if (recur.freq === 'WEEKLY' && byday.length === 0) preset = 'weekly';
  else if (recur.freq === 'MONTHLY' && byday.length === 0) preset = 'monthly';
  else if (recur.freq === 'YEARLY' && byday.length === 0) preset = 'yearly';
  else if (recur.freq === 'WEEKLY' && byday.length === 5) {
    const dtstart = vevent.getFirstPropertyValue('dtstart') as ICAL.Time | null;
    const expected = dtstart ? weekdaysByday(dtstart) : [];
    const matches =
      expected.length === 5 && expected.every((d) => byday.includes(d));
    if (!matches) return 'custom';
    preset = 'weekdays';
  } else {
    return 'custom';
  }

  return {
    preset,
    ...(recur.count ? { count: recur.count } : {}),
    ...(recur.until
      ? {
          until: lastRepeatDay(
            recur.until,
            vevent.getFirstPropertyValue('dtstart') as ICAL.Time | null
          ),
        }
      : {}),
  };
}

/**
 * The last day a timed rule still repeats on, from its UNTIL. A rule cut
 * short ("this and following") stops one second before an occurrence — on
 * that occurrence's own day — so read naively it claimed to run until a day
 * it no longer reaches. When UNTIL falls earlier in its day than the event
 * starts, the last repeat is the day before.
 */
function lastRepeatDay(until: ICAL.Time, dtstart: ICAL.Time | null): Date {
  const end = until.toJSDate();
  if (until.isDate || !dtstart || dtstart.isDate) return end;
  const start = dtstart.toJSDate();
  const minutes = (d: Date) => d.getHours() * 60 + d.getMinutes();
  if (minutes(end) >= minutes(start)) return end;
  const day = new Date(end);
  day.setDate(day.getDate() - 1);
  return day;
}
