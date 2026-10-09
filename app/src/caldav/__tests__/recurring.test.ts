import { readRecurrence } from '../rrule';
import {
  editOccurrence,
  editPreserving,
  excludeOccurrence,
  expandEvents,
  isFirstOccurrence,
  setWriteZone,
  splitSeries,
  truncateSeries,
} from '../ics';

// Six Mondays at 09:00–10:00 UTC, from 5 Oct 2026.
const WEEKLY = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//test//EN',
  'BEGIN:VEVENT',
  'UID:series-1',
  'DTSTAMP:20261001T000000Z',
  'DTSTART:20261005T090000Z',
  'DTEND:20261005T100000Z',
  'RRULE:FREQ=WEEKLY;COUNT=6',
  'SUMMARY:Standup',
  'ATTENDEE;CN=Duncan:mailto:duncan@example.com',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

// The same, all-day, for the value-type rules (EXDATE/UNTIL as DATE).
const WEEKLY_ALLDAY = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//test//EN',
  'BEGIN:VEVENT',
  'UID:series-2',
  'DTSTAMP:20261001T000000Z',
  'DTSTART;VALUE=DATE:20261005',
  'DTEND;VALUE=DATE:20261006',
  'RRULE:FREQ=WEEKLY',
  'SUMMARY:Bins out',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

// Apple-style zoned series.
const ZONED = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Apple Inc.//EN',
  'BEGIN:VTIMEZONE',
  'TZID:Asia/Singapore',
  'BEGIN:STANDARD',
  'DTSTART:19811231T233000',
  'TZOFFSETFROM:+0730',
  'TZOFFSETTO:+0800',
  'TZNAME:SGT',
  'END:STANDARD',
  'END:VTIMEZONE',
  'BEGIN:VEVENT',
  'UID:series-3',
  'DTSTAMP:20261001T000000Z',
  'DTSTART;TZID=Asia/Singapore:20261005T090000',
  'DTEND;TZID=Asia/Singapore:20261005T100000',
  'RRULE:FREQ=DAILY;COUNT=5',
  'SUMMARY:Gym',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

const FROM = new Date('2026-09-01T00:00:00Z');
const TO = new Date('2027-01-01T00:00:00Z');

function expand(ics: string) {
  return expandEvents(ics, 'u', 'e', FROM, TO).sort(
    (a, b) => a.start.getTime() - b.start.getTime()
  );
}

const iso = (d: Date) => d.toISOString();

describe('expandEvents occurrence identity', () => {
  it('gives every occurrence of a series its original start', () => {
    const occ = expand(WEEKLY);
    expect(occ).toHaveLength(6);
    expect(occ.every((o) => o.recurring)).toBe(true);
    expect(occ[2].recurrenceStart).toBe(Date.UTC(2026, 9, 19, 9) / 1000);
  });

  it('leaves a one-off event without one', () => {
    const one = WEEKLY.replace('RRULE:FREQ=WEEKLY;COUNT=6\r\n', '');
    expect(expand(one)[0].recurrenceStart).toBeUndefined();
  });
});

describe('editPreserving (whole series)', () => {
  it('shifts the series by the change made to one occurrence', () => {
    const third = expand(WEEKLY)[2]; // 19 Oct 09:00
    const out = editPreserving(
      WEEKLY,
      {
        start: new Date('2026-10-19T10:00:00Z'),
        end: new Date('2026-10-19T11:00:00Z'),
        allDay: false,
      },
      third.start
    );
    const occ = expand(out);
    // Every occurrence is still there — the series did not restart on the 19th.
    expect(occ).toHaveLength(6);
    expect(iso(occ[0].start)).toBe('2026-10-05T10:00:00.000Z');
    expect(iso(occ[5].start)).toBe('2026-11-09T10:00:00.000Z');
  });

  it('moves deleted and changed occurrences along with the series', () => {
    const occ = expand(WEEKLY);
    let ics = excludeOccurrence(WEEKLY, occ[1].recurrenceStart!); // no 12 Oct
    ics = editOccurrence(ics, occ[2].recurrenceStart!, occ[2], {
      summary: 'Special',
    }); // 19 Oct renamed
    const first = expand(ics)[0];
    const out = editPreserving(
      ics,
      {
        start: new Date(first.start.getTime() + 3_600_000),
        end: new Date(first.end.getTime() + 3_600_000),
        allDay: false,
      },
      first.start
    );
    const after = expand(out);
    expect(after).toHaveLength(5);
    expect(after.some((o) => o.start.getUTCDate() === 12)).toBe(false);
    const special = after.find((o) => o.summary === 'Special')!;
    expect(iso(special.start)).toBe('2026-10-19T10:00:00.000Z');
  });

  it('keeps the master untouched on a title-only edit, and edits the master', () => {
    const out = editPreserving(WEEKLY, { summary: 'Sync' });
    expect(out).toContain('DTSTART:20261005T090000Z');
    expect(expand(out).every((o) => o.summary === 'Sync')).toBe(true);
  });
});

describe('editOccurrence (this event)', () => {
  it('moves and renames one occurrence and leaves the rest alone', () => {
    const third = expand(WEEKLY)[2];
    const out = editOccurrence(WEEKLY, third.recurrenceStart!, third, {
      summary: 'Standup (moved)',
      start: new Date('2026-10-19T14:00:00Z'),
      end: new Date('2026-10-19T15:00:00Z'),
      allDay: false,
    });
    const occ = expand(out);
    expect(occ).toHaveLength(6);
    const moved = occ.find((o) => o.summary === 'Standup (moved)')!;
    expect(iso(moved.start)).toBe('2026-10-19T14:00:00.000Z');
    expect(occ.filter((o) => o.summary === 'Standup')).toHaveLength(5);
    // Copied from the master: attendees survive on the override.
    expect(out.match(/ATTENDEE/g)).toHaveLength(2);
    expect(out).toContain('RECURRENCE-ID:20261019T090000Z');
  });

  it('places a fresh override on its own date when only the title changes', () => {
    const fourth = expand(WEEKLY)[3];
    const out = editOccurrence(WEEKLY, fourth.recurrenceStart!, fourth, {
      summary: 'Retro',
    });
    const occ = expand(out);
    const retro = occ.find((o) => o.summary === 'Retro')!;
    expect(iso(retro.start)).toBe('2026-10-26T09:00:00.000Z');
    expect(occ).toHaveLength(6);
  });

  it('edits an existing override rather than adding a second', () => {
    const third = expand(WEEKLY)[2];
    const once = editOccurrence(WEEKLY, third.recurrenceStart!, third, {
      summary: 'A',
    });
    const overridden = expand(once).find((o) => o.summary === 'A')!;
    const twice = editOccurrence(
      once,
      overridden.recurrenceStart!,
      overridden,
      { summary: 'B' }
    );
    expect(twice.match(/RECURRENCE-ID/g)).toHaveLength(1);
    expect(expand(twice).filter((o) => o.summary === 'B')).toHaveLength(1);
  });
});

describe('excludeOccurrence (delete this event)', () => {
  it('removes just that occurrence', () => {
    const second = expand(WEEKLY)[1];
    const occ = expand(excludeOccurrence(WEEKLY, second.recurrenceStart!));
    expect(occ).toHaveLength(5);
    expect(occ.some((o) => iso(o.start) === iso(second.start))).toBe(false);
  });

  it('writes a DATE exclusion for an all-day series', () => {
    const second = expand(WEEKLY_ALLDAY)[1];
    const out = excludeOccurrence(WEEKLY_ALLDAY, second.recurrenceStart!);
    expect(out).toContain('EXDATE;VALUE=DATE:20261012');
    expect(expand(out).some((o) => o.start.getDate() === 12)).toBe(false);
  });

  it('keeps the zone on a zoned series', () => {
    const third = expand(ZONED)[2];
    const out = excludeOccurrence(ZONED, third.recurrenceStart!);
    expect(out).toContain('EXDATE;TZID=Asia/Singapore:20261007T090000');
    expect(expand(out)).toHaveLength(4);
  });

  it('drops the occurrence’s override too', () => {
    const third = expand(WEEKLY)[2];
    const edited = editOccurrence(WEEKLY, third.recurrenceStart!, third, {
      summary: 'A',
    });
    const out = excludeOccurrence(edited, third.recurrenceStart!);
    expect(out).not.toContain('RECURRENCE-ID');
    expect(expand(out)).toHaveLength(5);
  });
});

describe('truncateSeries (delete this and following)', () => {
  it('keeps only what came before', () => {
    const fourth = expand(WEEKLY)[3];
    const occ = expand(truncateSeries(WEEKLY, fourth.recurrenceStart!));
    expect(occ.map((o) => o.start.getUTCDate())).toEqual([5, 12, 19]);
  });

  it('reads back as repeating until the day before the cut', () => {
    const fourth = expand(WEEKLY)[3]; // Monday 26 Oct
    const read = readRecurrence(
      truncateSeries(WEEKLY, fourth.recurrenceStart!)
    );
    // Not "until 26 Oct", which the series no longer reaches.
    expect(read).toMatchObject({ preset: 'weekly' });
    const until = (read as { until: Date }).until;
    expect(until.getDate()).toBe(25);
  });

  it('ends an endless all-day series the day before', () => {
    const third = expand(WEEKLY_ALLDAY)[2];
    const out = truncateSeries(WEEKLY_ALLDAY, third.recurrenceStart!);
    expect(out).toContain('UNTIL=20261018');
    expect(expand(out)).toHaveLength(2);
  });
});

describe('splitSeries (edit this and following)', () => {
  it('splits into a head before and a changed tail from the occurrence', () => {
    const fourth = expand(WEEKLY)[3]; // 26 Oct
    const { head, tail } = splitSeries(
      WEEKLY,
      fourth.recurrenceStart!,
      fourth,
      {
        summary: 'Standup v2',
        start: new Date('2026-10-26T08:00:00Z'),
        end: new Date('2026-10-26T08:30:00Z'),
        allDay: false,
      },
      'series-1b'
    );
    expect(expand(head).map((o) => o.start.getUTCDate())).toEqual([5, 12, 19]);
    const after = expand(tail);
    // COUNT=6 with three already past leaves three.
    expect(after).toHaveLength(3);
    expect(after.every((o) => o.summary === 'Standup v2')).toBe(true);
    expect(iso(after[0].start)).toBe('2026-10-26T08:00:00.000Z');
    expect(iso(after[0].end)).toBe('2026-10-26T08:30:00.000Z');
    expect(tail).toContain('UID:series-1b');
    expect(tail).toContain('ATTENDEE');
  });

  it('carries later overrides across to the new series', () => {
    const occ = expand(WEEKLY);
    const withOverride = editOccurrence(
      WEEKLY,
      occ[4].recurrenceStart!,
      occ[4],
      {
        summary: 'Special',
      }
    );
    const { head, tail } = splitSeries(
      withOverride,
      occ[3].recurrenceStart!,
      occ[3],
      { summary: 'v2' },
      'series-1b'
    );
    expect(head).not.toContain('Special');
    const after = expand(tail);
    expect(after.map((o) => o.summary)).toEqual(['v2', 'Special', 'v2']);
  });
});

describe('all-day occurrences keep their length', () => {
  const lines = (ics: string, name: string) =>
    ics.split('\r\n').filter((l) => l.startsWith(name));
  // The same series over three days (Monday to Wednesday).
  const THREE_DAYS = WEEKLY_ALLDAY.replace(
    'DTEND;VALUE=DATE:20261006',
    'DTEND;VALUE=DATE:20261008'
  );

  it('keeps a renamed occurrence to its one day', () => {
    const second = expand(WEEKLY_ALLDAY)[1]; // Monday 12 Oct
    const out = editOccurrence(WEEKLY_ALLDAY, second.recurrenceStart!, second, {
      summary: 'Bins out (late)',
    });
    expect(lines(out, 'DTSTART')).toContain('DTSTART;VALUE=DATE:20261012');
    expect(lines(out, 'DTEND')).toContain('DTEND;VALUE=DATE:20261013');
    const renamed = expand(out).find((o) => o.summary === 'Bins out (late)')!;
    expect(renamed.end.getTime() - renamed.start.getTime()).toBe(86_400_000);
  });

  it('keeps a renamed occurrence of a longer series to its days', () => {
    const second = expand(THREE_DAYS)[1];
    const out = editOccurrence(THREE_DAYS, second.recurrenceStart!, second, {
      summary: 'Away',
    });
    expect(lines(out, 'DTEND')).toContain('DTEND;VALUE=DATE:20261015');
  });

  it('keeps every occurrence after a split to its one day', () => {
    const third = expand(WEEKLY_ALLDAY)[2]; // Monday 19 Oct
    const { tail } = splitSeries(
      WEEKLY_ALLDAY,
      third.recurrenceStart!,
      third,
      { summary: 'Bins v2' },
      'series-2b'
    );
    expect(lines(tail, 'DTSTART')).toEqual(['DTSTART;VALUE=DATE:20261019']);
    expect(lines(tail, 'DTEND')).toEqual(['DTEND;VALUE=DATE:20261020']);
    const after = expand(tail);
    expect(
      after.every((o) => o.end.getTime() - o.start.getTime() === 86_400_000)
    ).toBe(true);
  });

  it('keeps every occurrence of a longer series after a split to its days', () => {
    const third = expand(THREE_DAYS)[2];
    const { tail } = splitSeries(
      THREE_DAYS,
      third.recurrenceStart!,
      third,
      { summary: 'Away v2' },
      'series-2c'
    );
    expect(lines(tail, 'DTEND')).toEqual(['DTEND;VALUE=DATE:20261022']);
  });
});

describe('exclusions listed together on one EXDATE', () => {
  // Written back in UTC, whatever the machine's zone, so the hours compare.
  beforeEach(() => setWriteZone('UTC'));
  afterEach(() => setWriteZone(undefined));

  // Two deleted Mondays (12 and 19 Oct) on one line, as ical4j and Apple
  // write them.
  const TWO_GONE = WEEKLY.replace(
    'RRULE:FREQ=WEEKLY;COUNT=6\r\n',
    'RRULE:FREQ=WEEKLY;COUNT=6\r\nEXDATE:20261012T090000Z,20261019T090000Z\r\n'
  );

  it('are all deleted to begin with', () => {
    expect(expand(TWO_GONE).map((o) => o.start.getUTCDate())).toEqual([
      5, 26, 2, 9,
    ]);
  });

  it('all move with the series', () => {
    const first = expand(TWO_GONE)[0];
    const out = editPreserving(
      TWO_GONE,
      {
        start: new Date(first.start.getTime() + 3_600_000),
        end: new Date(first.end.getTime() + 3_600_000),
        allDay: false,
      },
      first.start
    );
    expect(out).toContain('EXDATE:20261012T100000Z,20261019T100000Z');
    const after = expand(out);
    expect(after.map((o) => o.start.getUTCDate())).toEqual([5, 26, 2, 9]);
    expect(after.every((o) => o.start.getUTCHours() === 10)).toBe(true);
  });

  it('go to the new series only from the split on', () => {
    const occ = expand(TWO_GONE);
    // Split at Monday 26 Oct: both deleted Mondays are before it.
    const late = splitSeries(
      TWO_GONE,
      occ[1].recurrenceStart!,
      occ[1],
      { summary: 'v2' },
      'series-1c'
    );
    expect(late.tail).not.toContain('EXDATE');
    // Split at 12 Oct with one deleted Monday on each side of it.
    const ics = TWO_GONE.replace(
      'EXDATE:20261012T090000Z,20261019T090000Z',
      'EXDATE:20261005T090000Z,20261019T090000Z'
    );
    const twelfth = expand(ics)[0]; // 12 Oct
    const { tail } = splitSeries(
      ics,
      twelfth.recurrenceStart!,
      twelfth,
      { summary: 'v2' },
      'series-1d'
    );
    // 5 Oct is before the split and goes; 19 Oct stays deleted.
    expect(tail).toContain('EXDATE:20261019T090000Z');
    expect(tail).not.toContain('20261005T090000Z');
    expect(expand(tail).map((o) => o.start.getUTCDate())).toEqual([
      12, 26, 2, 9,
    ]);
  });
});

describe('deleted and changed occurrences when the times change', () => {
  // Written back in UTC, whatever the machine's zone, so the hours compare.
  beforeEach(() => setWriteZone('UTC'));
  afterEach(() => setWriteZone(undefined));

  it('carry over to the new series of a split that moves the time', () => {
    const occ = expand(WEEKLY);
    let ics = editOccurrence(WEEKLY, occ[3].recurrenceStart!, occ[3], {
      summary: 'Special',
    }); // 26 Oct renamed
    ics = excludeOccurrence(ics, occ[4].recurrenceStart!); // no 2 Nov
    const third = expand(ics)[2]; // 19 Oct
    const { head, tail } = splitSeries(
      ics,
      third.recurrenceStart!,
      third,
      {
        start: new Date('2026-10-19T10:00:00Z'),
        end: new Date('2026-10-19T11:00:00Z'),
        allDay: false,
      },
      'series-1e'
    );
    expect(expand(head).map((o) => o.start.getUTCDate())).toEqual([5, 12]);
    const after = expand(tail);
    expect(after.map((o) => [iso(o.start), o.summary])).toEqual([
      ['2026-10-19T10:00:00.000Z', 'Standup'],
      ['2026-10-26T10:00:00.000Z', 'Special'],
      ['2026-11-09T10:00:00.000Z', 'Standup'],
    ]);
  });

  it('stay deleted when a timed series becomes all-day', () => {
    const occ = expand(WEEKLY);
    const ics = excludeOccurrence(WEEKLY, occ[1].recurrenceStart!); // 12 Oct
    const first = occ[0];
    const day = new Date(
      first.start.getFullYear(),
      first.start.getMonth(),
      first.start.getDate()
    );
    const out = editPreserving(
      ics,
      { start: day, end: day, allDay: true },
      first.start
    );
    expect(out).toContain('EXDATE;VALUE=DATE:20261012');
    const after = expand(out);
    expect(after.every((o) => o.allDay)).toBe(true);
    expect(after.map((o) => o.start.getDate())).toEqual([5, 19, 26, 2, 9]);
  });

  it('stay deleted, and changed, when an all-day series gets a time', () => {
    const occ = expand(WEEKLY_ALLDAY);
    let ics = excludeOccurrence(WEEKLY_ALLDAY, occ[1].recurrenceStart!);
    ics = editOccurrence(ics, occ[2].recurrenceStart!, occ[2], {
      summary: 'Bins (both)',
    });
    const first = expand(ics)[0]; // Monday 5 Oct
    const at9 = new Date(first.start);
    at9.setHours(9);
    const at10 = new Date(first.start);
    at10.setHours(10);
    const out = editPreserving(
      ics,
      { start: at9, end: at10, allDay: false },
      first.start
    );
    const after = expand(out).filter((o) => o.start < new Date(2026, 9, 27));
    // 12 Oct still gone; 19 Oct's change still applies to it.
    expect(after.map((o) => o.start.getDate())).toEqual([5, 19, 26]);
    expect(after[1].summary).toBe('Bins (both)');
    expect(after[0].start.getHours()).toBe(9);
    // Written in UTC here, so the same UTC time each week.
    expect(after[2].start.getUTCHours()).toBe(after[0].start.getUTCHours());
  });
});

describe('isFirstOccurrence', () => {
  it('knows the first occurrence from the rest', () => {
    const occ = expand(WEEKLY);
    expect(isFirstOccurrence(WEEKLY, occ[0].recurrenceStart!)).toBe(true);
    expect(isFirstOccurrence(WEEKLY, occ[1].recurrenceStart!)).toBe(false);
  });
});
