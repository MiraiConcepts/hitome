import { toTimeString } from '@/utils/date';

import {
  continuationEnd,
  dayHeader,
  groupByDay,
  headerDate,
  linkHost,
} from './format';
import type { WidgetEvent } from './types';

const ev = (
  start: Date,
  overrides: Partial<WidgetEvent> = {}
): WidgetEvent => ({
  summary: 'x',
  start: start.toISOString(),
  end: new Date(start.getTime() + 3_600_000).toISOString(),
  allDay: false,
  ...overrides,
});

const now = new Date(2026, 6, 8, 12, 0); // Wed 8 Jul 2026, noon

describe('headerDate', () => {
  it('formats weekday ▪ day short-month', () => {
    expect(headerDate(new Date(2026, 6, 9, 8, 0))).toBe('Thu ▪ 9 Jul');
  });
});

describe('linkHost', () => {
  it('strips scheme, www, and path down to the bare host', () => {
    expect(linkHost('https://meet.google.com/abc-defg-hij')).toBe(
      'meet.google.com'
    );
    expect(linkHost('https://www.google.com/search?q=x')).toBe('google.com');
    expect(linkHost('https://zoom.us')).toBe('zoom.us');
  });
});

describe('dayHeader', () => {
  it('formats weekday, day, and full month', () => {
    expect(dayHeader(new Date(2026, 6, 13, 9, 0), now)).toBe('Mon 13 July');
    expect(dayHeader(new Date(2026, 0, 1, 0, 0), now)).toBe('Thu 1 January');
  });

  it('labels the near days as just Today / Tomorrow', () => {
    expect(dayHeader(new Date(2026, 6, 8, 23, 0), now)).toBe('Today');
    expect(dayHeader(new Date(2026, 6, 9, 1, 0), now)).toBe('Tomorrow');
  });
});

describe('groupByDay', () => {
  it('buckets by local start day, days ascending', () => {
    const groups = groupByDay(
      [
        ev(new Date(2026, 6, 14, 9, 0)),
        ev(new Date(2026, 6, 13, 15, 0)),
        ev(new Date(2026, 6, 13, 9, 0)),
      ],
      now
    );
    expect(groups.map((g) => g.day)).toEqual(['2026-07-13', '2026-07-14']);
    expect(groups[0].header).toBe('Mon 13 July');
    expect(groups[0].items).toHaveLength(2);
    expect(groups[1].items).toHaveLength(1);
    expect(groups[0].items[0].spanDays).toBe(1);
  });

  it('orders all-day before timed within a day', () => {
    const [group] = groupByDay(
      [
        ev(new Date(2026, 6, 13, 9, 0), { summary: 'timed' }),
        ev(new Date(2026, 6, 13, 0, 0), { summary: 'allday', allDay: true }),
      ],
      now
    );
    expect(group.items.map((i) => i.event.summary)).toEqual([
      'allday',
      'timed',
    ]);
  });

  it('expands a multi-day event across every day it covers, with (n/N)', () => {
    const groups = groupByDay(
      [
        ev(new Date(2026, 6, 13, 0, 0), {
          summary: 'trip',
          allDay: true,
          end: new Date(2026, 6, 16, 0, 0).toISOString(),
        }),
      ],
      now
    );
    expect(groups.map((g) => g.day)).toEqual([
      '2026-07-13',
      '2026-07-14',
      '2026-07-15',
    ]);
    expect(groups.map((g) => g.items[0].dayIndex)).toEqual([1, 2, 3]);
    expect(groups.every((g) => g.items[0].spanDays === 3)).toBe(true);
  });

  it('drops past days of a running event but keeps true-start indices', () => {
    // now = Wed 8 Jul; a Mon 6 → Fri 11 (exclusive) event: days 6 & 7 dropped,
    // dayIndex still counts from the true start (Jul 6).
    const groups = groupByDay(
      [
        ev(new Date(2026, 6, 6, 0, 0), {
          summary: 'vacation',
          allDay: true,
          end: new Date(2026, 6, 11, 0, 0).toISOString(),
        }),
      ],
      now
    );
    expect(groups.map((g) => g.day)).toEqual([
      '2026-07-08',
      '2026-07-09',
      '2026-07-10',
    ]);
    expect(groups.map((g) => g.items[0].dayIndex)).toEqual([3, 4, 5]);
    expect(groups[0].items[0].spanDays).toBe(5);
  });

  it('expands a late-night spillover onto the day it ends', () => {
    const groups = groupByDay(
      [
        ev(new Date(2026, 6, 10, 18, 0), {
          summary: 'party',
          end: new Date(2026, 6, 11, 1, 30).toISOString(),
        }),
      ],
      now
    );
    expect(groups.map((g) => g.day)).toEqual(['2026-07-10', '2026-07-11']);
    expect(groups[0].items[0].spanDays).toBe(2);
  });
});

describe('continuationEnd', () => {
  it('returns the end on the final day of a timed multi-day event', () => {
    const groups = groupByDay(
      [
        ev(new Date(2026, 6, 10, 23, 0), {
          summary: 'flight',
          end: new Date(2026, 6, 11, 9, 40).toISOString(),
        }),
      ],
      now
    );
    const [d1, d2] = groups;
    expect(continuationEnd(d1.items[0], d1.day)).toBeNull();
    const end = continuationEnd(d2.items[0], d2.day);
    expect(end && toTimeString(end)).toBe('09:40');
  });

  it('is null for all-day events on every covered day', () => {
    const groups = groupByDay(
      [
        ev(new Date(2026, 6, 13, 0, 0), {
          allDay: true,
          end: new Date(2026, 6, 16, 0, 0).toISOString(),
        }),
      ],
      now
    );
    expect(groups).toHaveLength(3);
    for (const g of groups) {
      expect(continuationEnd(g.items[0], g.day)).toBeNull();
    }
  });

  it('is null on middle days; only the true end day shows a time', () => {
    // Fri 18:00 → Sun 09:00: Sat is fully covered (sun), Sun leads with → end.
    const groups = groupByDay(
      [
        ev(new Date(2026, 6, 10, 18, 0), {
          end: new Date(2026, 6, 12, 9, 0).toISOString(),
        }),
      ],
      now
    );
    expect(groups.map((g) => g.day)).toEqual([
      '2026-07-10',
      '2026-07-11',
      '2026-07-12',
    ]);
    expect(continuationEnd(groups[1].items[0], groups[1].day)).toBeNull();
    const end = continuationEnd(groups[2].items[0], groups[2].day);
    expect(end && toTimeString(end)).toBe('09:00');
  });

  it('prints a small-hours end on the day it lands', () => {
    // Fri 18:00 → Sat 01:30: Saturday leads with the end, not the sun.
    const groups = groupByDay(
      [
        ev(new Date(2026, 6, 10, 18, 0), {
          end: new Date(2026, 6, 11, 1, 30).toISOString(),
        }),
      ],
      now
    );
    const end = continuationEnd(groups[1].items[0], groups[1].day);
    expect(end && toTimeString(end)).toBe('01:30');
  });
});
