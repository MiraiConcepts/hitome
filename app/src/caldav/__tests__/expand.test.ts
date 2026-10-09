import ICAL from 'ical.js';

import { expandEvents } from '../ics';

// Long-running series and moved occurrences: which occurrences a month's
// window gets, whatever happened before it or outside it.

const cal = (...lines: string[]) =>
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//test//EN',
    ...lines,
    'END:VCALENDAR',
  ].join('\r\n');

const series = (start: string, rule: string, end?: string) =>
  cal(
    'BEGIN:VEVENT',
    'UID:long-1',
    'DTSTAMP:20150101T000000Z',
    start,
    ...(end ? [end] : []),
    `RRULE:${rule}`,
    'SUMMARY:Long',
    'END:VEVENT'
  );

const OCT = [
  new Date('2026-10-01T00:00:00Z'),
  new Date('2026-11-01T00:00:00Z'),
] as const;

function expand(ics: string, from: Date = OCT[0], to: Date = OCT[1]) {
  return expandEvents(ics, 'u', 'e', from, to).sort(
    (a, b) => a.start.getTime() - b.start.getTime()
  );
}

const iso = (d: Date) => d.toISOString();

/** Every start the rule itself gives in [from, to], walked from DTSTART with
 *  no limit: what the expansion must agree with. */
function walked(ics: string, from: Date, to: Date): string[] {
  const vevent = new ICAL.Component(ICAL.parse(ics)).getFirstSubcomponent(
    'vevent'
  )!;
  const event = new ICAL.Event(vevent);
  const length =
    event.endDate.toJSDate().getTime() - event.startDate.toJSDate().getTime();
  const iterator = event.iterator();
  const out: string[] = [];
  for (let next = iterator.next(); next; next = iterator.next()) {
    const at = next.toJSDate().getTime();
    if (at > to.getTime()) break;
    if (at + length >= from.getTime()) out.push(new Date(at).toISOString());
  }
  return out;
}

describe('series begun long ago', () => {
  it('shows a daily series from 2015 in October 2026', () => {
    const ics = series(
      'DTSTART:20150301T010000Z',
      'FREQ=DAILY',
      'DTEND:20150301T020000Z'
    );
    const occ = expand(ics);
    expect(occ).toHaveLength(31);
    expect(iso(occ[0].start)).toBe('2026-10-01T01:00:00.000Z');
    expect(iso(occ[30].start)).toBe('2026-10-31T01:00:00.000Z');
    // Still the series' own occurrences, keyed by their place in it.
    expect(occ[0].recurrenceStart).toBe(Date.UTC(2026, 9, 1, 1) / 1000);
  });

  it('shows a Monday to Friday series from 2018', () => {
    const ics = series(
      'DTSTART;TZID=Europe/Berlin:20180102T090000',
      'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
      'DTEND;TZID=Europe/Berlin:20180102T093000'
    );
    const occ = expand(ics);
    expect(occ).toHaveLength(22);
    expect(occ.every((o) => o.start.getUTCDay() >= 1)).toBe(true);
    expect(occ.every((o) => o.start.getUTCDay() <= 5)).toBe(true);
    // 9:00 in Berlin on both sides of the clocks going back (25 Oct).
    expect(iso(occ[0].start)).toBe('2026-10-01T07:00:00.000Z');
    expect(iso(occ[21].start)).toBe('2026-10-30T08:00:00.000Z');
  });

  it('shows an all-day daily series from 2015', () => {
    const ics = series(
      'DTSTART;VALUE=DATE:20150301',
      'FREQ=DAILY',
      'DTEND;VALUE=DATE:20150302'
    );
    const occ = expand(ics);
    expect(occ.length).toBeGreaterThanOrEqual(31);
    expect(occ.every((o) => o.allDay)).toBe(true);
  });

  it('agrees with an unlimited walk of the rule', () => {
    const cases: [string, string, string][] = [
      ['DTSTART:20150301T010000Z', 'FREQ=DAILY;INTERVAL=3', 'PT1H'],
      [
        'DTSTART:20180103T080000Z',
        'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE',
        'PT1H',
      ],
      ['DTSTART:19900104T120000Z', 'FREQ=WEEKLY', 'PT2H'],
      ['DTSTART:20000101T000000Z', 'FREQ=HOURLY;INTERVAL=7', 'PT30M'],
      ['DTSTART;TZID=Europe/Berlin:20150301T090000', 'FREQ=DAILY', 'PT1H'],
      [
        'DTSTART;TZID=America/New_York:20100101T233000',
        'FREQ=HOURLY;INTERVAL=5',
        'PT1H',
      ],
      [
        'DTSTART:20150301T010000Z',
        'FREQ=DAILY;BYMONTH=10;BYMONTHDAY=7,31',
        'PT1H',
      ],
      ['DTSTART:20150301T010000Z', 'FREQ=DAILY;UNTIL=20261015T000000Z', 'PT1H'],
      // Long enough to reach into the window from an earlier start.
      ['DTSTART:20150301T010000Z', 'FREQ=DAILY;INTERVAL=2', 'P3D'],
    ];
    for (const [start, rule, duration] of cases) {
      const ics = series(start, rule, `DURATION:${duration}`);
      expect([rule, expand(ics).map((o) => iso(o.start))]).toEqual([
        rule,
        walked(ics, OCT[0], OCT[1]),
      ]);
    }
  });

  it('still shows a series counted from long ago', () => {
    const ics = series(
      'DTSTART:20150301T010000Z',
      'FREQ=DAILY;COUNT=5000',
      'DTEND:20150301T020000Z'
    );
    expect(expand(ics)).toHaveLength(31);
  });

  it('expands very frequent old rules quickly and within the cap', () => {
    for (const [start, rule] of [
      ['DTSTART:20000101T000000Z', 'FREQ=HOURLY'],
      ['DTSTART;TZID=Europe/Berlin:20000101T000000', 'FREQ=HOURLY'],
      ['DTSTART:20000101T000000Z', 'FREQ=MINUTELY'],
      ['DTSTART;TZID=Europe/Berlin:20000101T000000', 'FREQ=MINUTELY'],
      ['DTSTART:20000101T000000Z', 'FREQ=SECONDLY'],
      ['DTSTART;TZID=Europe/Berlin:20000101T000000', 'FREQ=SECONDLY'],
      ['DTSTART:20000101T000000Z', 'FREQ=SECONDLY;COUNT=100000000'],
    ]) {
      const ics = series(start, rule);
      const began = performance.now();
      const occ = expand(ics);
      // Walked by the second from 2000 this would take minutes; tens of ms
      // under bun, a few hundred at most under jest's slower transform.
      expect([rule, performance.now() - began < 1000]).toEqual([rule, true]);
      expect(occ.length).toBeLessThanOrEqual(1000);
    }
    const hourly = expand(series('DTSTART:20000101T000000Z', 'FREQ=HOURLY'));
    expect(iso(hourly[0].start)).toBe('2026-10-01T00:00:00.000Z');
    expect(hourly.length).toBeGreaterThan(700);
  });
});

describe('moved occurrences and the window', () => {
  // Mondays 2, 9, 16, 23 and 30 November 2026.
  const NOVEMBER = cal(
    'BEGIN:VEVENT',
    'UID:moved-1',
    'DTSTAMP:20261001T000000Z',
    'DTSTART:20261102T090000Z',
    'DTEND:20261102T100000Z',
    'RRULE:FREQ=WEEKLY;COUNT=5',
    'SUMMARY:Review',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:moved-1',
    'DTSTAMP:20261001T000000Z',
    'RECURRENCE-ID:20261109T090000Z',
    'DTSTART:20261225T090000Z',
    'DTEND:20261225T100000Z',
    'SUMMARY:Review (moved)',
    'END:VEVENT'
  );
  const NOV = [
    new Date('2026-11-01T00:00:00Z'),
    new Date('2026-12-01T00:00:00Z'),
  ] as const;
  const DEC = [
    new Date('2026-12-01T00:00:00Z'),
    new Date('2027-01-01T00:00:00Z'),
  ] as const;

  it('keeps the later occurrences when one is moved past the window', () => {
    const occ = expand(NOVEMBER, ...NOV);
    expect(occ.map((o) => o.start.getUTCDate())).toEqual([2, 16, 23, 30]);
    expect(occ.every((o) => o.summary === 'Review')).toBe(true);
  });

  it('shows the moved occurrence where it now is, once', () => {
    const occ = expand(NOVEMBER, ...DEC);
    expect(occ).toHaveLength(1);
    expect(occ[0].summary).toBe('Review (moved)');
    expect(iso(occ[0].start)).toBe('2026-12-25T09:00:00.000Z');
    expect(occ[0].recurrenceStart).toBe(Date.UTC(2026, 10, 9, 9) / 1000);
  });

  it('shows an occurrence moved back into the window from after it', () => {
    const ics = NOVEMBER.replace(
      'RECURRENCE-ID:20261109T090000Z\r\nDTSTART:20261225T090000Z\r\nDTEND:20261225T100000Z',
      'RECURRENCE-ID:20261130T090000Z\r\nDTSTART:20261028T090000Z\r\nDTEND:20261028T100000Z'
    );
    const october = expand(ics);
    expect(october.map((o) => o.summary)).toEqual(['Review (moved)']);
    expect(iso(october[0].start)).toBe('2026-10-28T09:00:00.000Z');
    expect(expand(ics, ...NOV).map((o) => o.start.getUTCDate())).toEqual([
      2, 9, 16, 23,
    ]);
  });

  it('does not show an override whose occurrence the series never has', () => {
    const ics = NOVEMBER.replace(
      'RECURRENCE-ID:20261109T090000Z',
      'RECURRENCE-ID:20261110T090000Z'
    );
    expect(expand(ics, ...DEC)).toHaveLength(0);
  });
});

describe('cancelled events', () => {
  // Mondays 2, 9, 16, 23 and 30 November 2026, as an organiser's server
  // writes them after cancelling one meeting of the series.
  const SERIES = cal(
    'BEGIN:VEVENT',
    'UID:cancel-1',
    'DTSTAMP:20261001T000000Z',
    'DTSTART:20261102T090000Z',
    'DTEND:20261102T100000Z',
    'RRULE:FREQ=WEEKLY;COUNT=5',
    'SUMMARY:Standup',
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:cancel-1',
    'DTSTAMP:20261005T000000Z',
    'RECURRENCE-ID:20261116T090000Z',
    'DTSTART:20261116T090000Z',
    'DTEND:20261116T100000Z',
    'SUMMARY:Standup',
    'STATUS:CANCELLED',
    'SEQUENCE:1',
    'END:VEVENT'
  );
  const NOV = [
    new Date('2026-11-01T00:00:00Z'),
    new Date('2026-12-01T00:00:00Z'),
  ] as const;

  it('leaves out a cancelled occurrence, as an EXDATE would', () => {
    const occ = expand(SERIES, ...NOV);
    expect(occ.map((o) => o.start.getUTCDate())).toEqual([2, 9, 23, 30]);
  });

  it('leaves out a cancelled occurrence that was also moved', () => {
    const ics = SERIES.replace(
      'DTSTART:20261116T090000Z\r\nDTEND:20261116T100000Z',
      'DTSTART:20261117T090000Z\r\nDTEND:20261117T100000Z'
    );
    expect(expand(ics, ...NOV).map((o) => o.start.getUTCDate())).toEqual([
      2, 9, 23, 30,
    ]);
  });

  it('leaves out a cancelled series', () => {
    const ics = SERIES.replace('STATUS:CONFIRMED', 'STATUS:CANCELLED');
    expect(expand(ics, ...NOV)).toHaveLength(0);
  });

  it('leaves out a cancelled single event', () => {
    const single = (status: string) =>
      cal(
        'BEGIN:VEVENT',
        'UID:cancel-2',
        'DTSTAMP:20261001T000000Z',
        'DTSTART:20261014T120000Z',
        'DTEND:20261014T130000Z',
        'SUMMARY:Lunch',
        `STATUS:${status}`,
        'END:VEVENT'
      );
    expect(expand(single('CANCELLED'))).toHaveLength(0);
    expect(expand(single('TENTATIVE'))).toHaveLength(1);
  });
});
