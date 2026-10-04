import { readAlarm } from '@/caldav/valarm';
import { readRecurrence } from '@/caldav/rrule';

import {
  argbToHex,
  durationMs,
  firedBefore,
  instanceToEvent,
  localDayToUtc,
  remainingRule,
  rruleFor,
  seriesIdOf,
  timeValues,
  truncateRule,
  utcDayToLocal,
} from './map';

const none = {
  alarms: new Map<string, number>(),
  overridden: new Set<string>(),
};

const timedRow = {
  begin: new Date(2026, 9, 5, 9, 0).getTime(),
  end: new Date(2026, 9, 5, 10, 0).getTime(),
  event_id: 41,
  title: 'Dentist',
  description: null,
  eventLocation: 'Clinic',
  allDay: 0,
  calendar_id: 2,
  calendar_displayName: 'carrein-calendar',
  calendar_color: -16776961, // 0xFF0000FF
  displayColor: -16776961,
  rrule: null,
  original_id: null,
  originalInstanceTime: null,
  hasAlarm: 0,
  dtstart: new Date(2026, 9, 5, 9, 0).getTime(),
  duration: null,
  eventTimezone: 'Asia/Singapore',
  eventStatus: 1,
};

describe('instanceToEvent', () => {
  it('maps a one-off timed event', () => {
    const e = instanceToEvent(timedRow, none);
    expect(e.summary).toBe('Dentist');
    expect(e.location).toBe('Clinic');
    expect(e.url).toBe('store:2/41');
    expect(e.start).toEqual(new Date(2026, 9, 5, 9, 0));
    expect(e.recurring).toBeUndefined();
    expect(e.color).toBe('#0000ff');
    expect(seriesIdOf(e)).toBe('41');
  });

  it('reads an all-day day from UTC midnight as that local date', () => {
    const e = instanceToEvent(
      {
        ...timedRow,
        allDay: 1,
        begin: Date.UTC(2026, 9, 8),
        end: Date.UTC(2026, 9, 9),
        calendar_displayName: 'carrein-birthday',
      },
      none
    );
    expect(e.allDay).toBe(true);
    expect(e.start).toEqual(new Date(2026, 9, 8));
    expect(e.end).toEqual(new Date(2026, 9, 9));
    expect(e.icon).toBe('gift');
  });

  it('gives an occurrence of a series its address and readable rule', () => {
    const begin = new Date(2026, 9, 12, 9, 0).getTime();
    const e = instanceToEvent(
      {
        ...timedRow,
        begin,
        end: begin + 3_600_000,
        rrule: 'FREQ=WEEKLY;COUNT=4',
      },
      { ...none, alarms: new Map([['41', 10]]) }
    );
    expect(e.recurring).toBe(true);
    expect(e.recurrenceStart).toBe(begin / 1000);
    expect(readRecurrence(e.raw)).toEqual({ preset: 'weekly', count: 4 });
    expect(readAlarm(e.raw)).toEqual({ offsetMinutes: 10 });
    expect(e.alarm).toBe(true);
  });

  it('marks a series with changed occurrences as a custom repeat', () => {
    const e = instanceToEvent(
      { ...timedRow, rrule: 'FREQ=WEEKLY' },
      { ...none, overridden: new Set(['41']) }
    );
    expect(readRecurrence(e.raw)).toBe('custom');
  });

  it('addresses an exception by its original occurrence and series', () => {
    const original = new Date(2026, 9, 12, 9, 0).getTime();
    const e = instanceToEvent(
      {
        ...timedRow,
        event_id: 77,
        original_id: 41, // a number, as the store returns it
        originalInstanceTime: original,
        begin: original + 3_600_000,
        end: original + 7_200_000,
      },
      none
    );
    expect(e.recurring).toBe(true);
    expect(e.recurrenceStart).toBe(original / 1000);
    expect(seriesIdOf(e)).toBe('41');
    expect(e.url).toBe('store:2/77');
  });

  it('reads a weekday series from a local start, not a UTC one', () => {
    // Monday 07:00 in Singapore is Sunday 23:00 UTC.
    const start = new Date(2026, 9, 5, 7, 0);
    const rule = rruleFor({ preset: 'weekdays' }, start, false);
    expect(rule).toContain('BYDAY=MO,TU,WE,TH,FR');
    const e = instanceToEvent(
      {
        ...timedRow,
        rrule: rule,
        dtstart: start.getTime(),
        begin: start.getTime(),
      },
      none
    );
    expect(readRecurrence(e.raw)).toEqual({ preset: 'weekdays' });
  });
});

describe('timeValues', () => {
  it('stores an all-day span as UTC midnights with an exclusive end', () => {
    const v = timeValues(
      {
        start: new Date(2026, 9, 12),
        end: new Date(2026, 9, 14),
        allDay: true,
      },
      false,
      'Asia/Singapore'
    );
    expect(v).toMatchObject({
      allDay: 1,
      dtstart: Date.UTC(2026, 9, 12),
      dtend: Date.UTC(2026, 9, 15),
      eventTimezone: 'UTC',
      duration: null,
    });
  });

  it('gives a repeating event a duration instead of an end', () => {
    const start = new Date(2026, 9, 5, 9, 0);
    const v = timeValues(
      { start, end: new Date(2026, 9, 5, 10, 30), allDay: false },
      true,
      'Asia/Singapore'
    );
    expect(v).toMatchObject({
      dtstart: start.getTime(),
      dtend: null,
      duration: 'P5400S',
      eventTimezone: 'Asia/Singapore',
    });
    expect(durationMs(v.duration as string)).toBe(5_400_000);
  });

  it('counts a three-day all-day repeat as P3D', () => {
    const v = timeValues(
      {
        start: new Date(2026, 9, 12),
        end: new Date(2026, 9, 14),
        allDay: true,
      },
      true,
      'UTC'
    );
    expect(v.duration).toBe('P3D');
  });
});

describe('splitting a rule', () => {
  const start = Date.UTC(2026, 9, 5, 1, 0); // Mondays 09:00 SGT
  const fourth = Date.UTC(2026, 9, 26, 1, 0);

  it('counts what fired before an occurrence', () => {
    expect(firedBefore('FREQ=WEEKLY;COUNT=6', start, false, fourth)).toBe(3);
  });

  it('cuts a timed rule one second before it, dropping COUNT', () => {
    const cut = truncateRule('FREQ=WEEKLY;COUNT=6', fourth, false);
    expect(cut).toContain('UNTIL=20261026T005959Z');
    expect(cut).not.toContain('COUNT');
  });

  it('cuts an all-day rule the day before', () => {
    const cut = truncateRule('FREQ=WEEKLY', Date.UTC(2026, 9, 19), true);
    expect(cut).toContain('UNTIL=20261018');
  });

  it('leaves the tail what remains of a COUNT', () => {
    expect(remainingRule('FREQ=WEEKLY;COUNT=6', 3)).toBe('FREQ=WEEKLY;COUNT=3');
    expect(remainingRule('FREQ=WEEKLY', 3)).toBe('FREQ=WEEKLY');
  });
});

describe('small conversions', () => {
  it('round-trips a local day through the store’s UTC midnight', () => {
    const day = new Date(2026, 1, 28);
    expect(utcDayToLocal(localDayToUtc(day))).toEqual(day);
  });
  it('drops alpha from an ARGB colour', () => {
    expect(argbToHex(0xffffbd4f | 0)).toBe('#ffbd4f');
    expect(argbToHex(null)).toBeUndefined();
  });
});
