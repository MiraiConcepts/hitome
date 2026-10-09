import {
  buildEventICS,
  editOccurrence,
  editPreserving,
  expandEvents,
  setWriteZone,
  splitSeries,
} from '../ics';

// Timed events are written in a zone so a repeating 9:00 stays 9:00 across
// daylight saving. Each test names the zone the phone would hand over at
// launch — UTC unless it says otherwise, whatever the machine's own zone (bun
// runs tests in UTC, jest in the host's).

beforeEach(() => setWriteZone('UTC'));
afterEach(() => setWriteZone(undefined));

const FROM = new Date('2026-01-01T00:00:00Z');
const TO = new Date('2027-01-01T00:00:00Z');

describe('writing in the phone’s zone', () => {
  it('writes a new timed event with TZID and its VTIMEZONE', () => {
    setWriteZone('Europe/London');
    const ics = buildEventICS(
      {
        summary: 'Lunch',
        start: new Date('2026-07-02T11:00:00Z'), // 12:00 BST
        end: new Date('2026-07-02T12:00:00Z'),
        allDay: false,
      },
      'Z-1'
    );
    expect(ics).toContain('DTSTART;TZID=Europe/London:20260702T120000');
    expect(ics).toContain('DTEND;TZID=Europe/London:20260702T130000');
    expect(ics).toContain('BEGIN:VTIMEZONE');
    expect(ics).toContain('TZID:Europe/London');
    // Read back, it is the same instant.
    const [event] = expandEvents(ics, 'u', 'e', FROM, TO);
    expect(event.start.toISOString()).toBe('2026-07-02T11:00:00.000Z');
  });

  it('keeps a weekly 9:00 at 9:00 across the clocks going forward', () => {
    setWriteZone('Europe/London');
    const ics = buildEventICS(
      {
        summary: 'Standup',
        start: new Date('2026-03-16T09:00:00Z'), // Monday 9:00 GMT
        end: new Date('2026-03-16T09:15:00Z'),
        allDay: false,
        recurrence: { preset: 'weekly', count: 4 },
      },
      'Z-2'
    );
    const hours = expandEvents(ics, 'u', 'e', FROM, TO)
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .map((o) => o.start.toISOString().slice(11, 16));
    // BST starts 29 March: the same 9:00 is an hour earlier in UTC after it.
    expect(hours).toEqual(['09:00', '09:00', '08:00', '08:00']);
  });

  it('keeps an event in the zone it was made in when edited elsewhere', () => {
    setWriteZone('Asia/Tokyo');
    const tokyo = buildEventICS(
      {
        summary: 'Meeting',
        start: new Date('2026-07-02T00:00:00Z'), // 9:00 Tokyo
        end: new Date('2026-07-02T01:00:00Z'),
        allDay: false,
      },
      'Z-3'
    );
    // Back home, an hour later.
    setWriteZone('Asia/Singapore');
    const out = editPreserving(tokyo, {
      start: new Date('2026-07-02T01:00:00Z'),
      end: new Date('2026-07-02T02:00:00Z'),
      allDay: false,
    });
    expect(out).toContain('DTSTART;TZID=Asia/Tokyo:20260702T100000');
    expect(out).not.toContain('Asia/Singapore');
  });

  it('moves a UTC event into the phone’s zone when its time is edited', () => {
    const utc = buildEventICS(
      {
        summary: 'Old',
        start: new Date('2026-07-02T01:00:00Z'),
        end: new Date('2026-07-02T02:00:00Z'),
        allDay: false,
      },
      'Z-4'
    );
    expect(utc).toContain('DTSTART:20260702T010000Z');
    setWriteZone('Asia/Singapore');
    const out = editPreserving(utc, {
      start: new Date('2026-07-02T02:00:00Z'),
      end: new Date('2026-07-02T03:00:00Z'),
      allDay: false,
    });
    expect(out).toContain('DTSTART;TZID=Asia/Singapore:20260702T100000');
  });

  it('leaves a title-only edit of a UTC event byte-identical in its times', () => {
    const utc = buildEventICS(
      {
        summary: 'Old',
        start: new Date('2026-07-02T01:00:00Z'),
        end: new Date('2026-07-02T02:00:00Z'),
        allDay: false,
      },
      'Z-5'
    );
    setWriteZone('Asia/Singapore');
    const out = editPreserving(utc, { summary: 'New' });
    expect(out).toContain('DTSTART:20260702T010000Z');
    expect(out).not.toContain('VTIMEZONE');
  });

  it('falls back to UTC for a zone it has no definition for', () => {
    setWriteZone('Mars/Olympus_Mons');
    const ics = buildEventICS(
      {
        summary: 'x',
        start: new Date('2026-07-02T11:00:00Z'),
        end: new Date('2026-07-02T12:00:00Z'),
        allDay: false,
      },
      'Z-6'
    );
    expect(ics).toContain('DTSTART:20260702T110000Z');
  });

  it('stamps DTSTAMP in UTC', () => {
    setWriteZone('Asia/Singapore');
    const ics = buildEventICS(
      {
        summary: 'x',
        start: new Date('2026-07-02T11:00:00Z'),
        end: new Date('2026-07-02T12:00:00Z'),
        allDay: false,
      },
      'Z-7'
    );
    expect(ics).toMatch(/DTSTAMP:\d{8}T\d{6}Z/);
  });
});

describe('a zone named only by its VTIMEZONE (Outlook, Exchange)', () => {
  // Weekly Wednesdays 9:00 Central European time, under the Windows name for
  // the zone, which only the embedded VTIMEZONE defines.
  const EXCHANGE = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:Microsoft Exchange Server 2010',
    'BEGIN:VTIMEZONE',
    'TZID:W. Europe Standard Time',
    'BEGIN:STANDARD',
    'DTSTART:16010101T030000',
    'TZOFFSETFROM:+0200',
    'TZOFFSETTO:+0100',
    'RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=-1SU;BYMONTH=10',
    'END:STANDARD',
    'BEGIN:DAYLIGHT',
    'DTSTART:16010101T020000',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0200',
    'RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=-1SU;BYMONTH=3',
    'END:DAYLIGHT',
    'END:VTIMEZONE',
    'BEGIN:VEVENT',
    'UID:040000008200E00074C5B7101A82E008',
    'DTSTAMP:20260901T000000Z',
    'DTSTART;TZID=W. Europe Standard Time:20261014T090000',
    'DTEND;TZID=W. Europe Standard Time:20261014T100000',
    'RRULE:FREQ=WEEKLY;COUNT=6',
    'SUMMARY:Weekly sync',
    'ORGANIZER;CN=Anna:mailto:anna@example.com',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const TZ = 'TZID=W. Europe Standard Time';

  const occurrences = (ics: string) =>
    expandEvents(ics, 'u', 'e', FROM, TO).sort(
      (a, b) => a.start.getTime() - b.start.getTime()
    );
  const hour = 3_600_000;

  it('reads at the right instants on both sides of the clocks going back', () => {
    const occ = occurrences(EXCHANGE);
    expect(occ[0].start.toISOString()).toBe('2026-10-14T07:00:00.000Z');
    expect(occ[3].start.toISOString()).toBe('2026-11-04T08:00:00.000Z');
  });

  it('moves the whole series in its own zone', () => {
    const fourth = occurrences(EXCHANGE)[3]; // 4 Nov, after the change
    const out = editPreserving(
      EXCHANGE,
      {
        start: new Date(fourth.start.getTime() + hour),
        end: new Date(fourth.end.getTime() + hour),
        allDay: false,
      },
      fourth.start
    );
    expect(out).toContain(`DTSTART;${TZ}:20261014T100000`);
    expect(out).toContain(`DTEND;${TZ}:20261014T110000`);
    const after = occurrences(out);
    expect(after[0].start.toISOString()).toBe('2026-10-14T08:00:00.000Z');
    expect(after[3].start.toISOString()).toBe('2026-11-04T09:00:00.000Z');
  });

  it('edits one occurrence', () => {
    const fourth = occurrences(EXCHANGE)[3];
    const renamed = editOccurrence(EXCHANGE, fourth.recurrenceStart!, fourth, {
      summary: 'Sync (Anna away)',
    });
    expect(renamed).toContain(`RECURRENCE-ID;${TZ}:20261104T090000`);
    expect(renamed).toContain(`DTSTART;${TZ}:20261104T090000`);
    const moved = editOccurrence(EXCHANGE, fourth.recurrenceStart!, fourth, {
      start: new Date('2026-11-04T13:00:00Z'),
      end: new Date('2026-11-04T14:00:00Z'),
      allDay: false,
    });
    expect(moved).toContain(`DTSTART;${TZ}:20261104T140000`);
    const one = occurrences(moved).filter(
      (o) => o.start.toISOString() === '2026-11-04T13:00:00.000Z'
    );
    expect(one).toHaveLength(1);
    expect(occurrences(moved)).toHaveLength(6);
  });

  it('splits the series from one occurrence on', () => {
    const third = occurrences(EXCHANGE)[2]; // 28 Oct
    const { head, tail } = splitSeries(
      EXCHANGE,
      third.recurrenceStart!,
      third,
      {
        start: new Date(third.start.getTime() + hour),
        end: new Date(third.end.getTime() + hour),
        allDay: false,
      },
      'tail-1'
    );
    expect(occurrences(head)).toHaveLength(2);
    expect(tail).toContain(`DTSTART;${TZ}:20261028T100000`);
    expect(tail).toContain('TZID:W. Europe Standard Time');
    expect(occurrences(tail)[0].start.toISOString()).toBe(
      '2026-10-28T09:00:00.000Z'
    );
  });

  it('falls back to UTC when the embedded zone cannot be used', () => {
    const broken = EXCHANGE.replace(/BEGIN:STANDARD[\s\S]*END:DAYLIGHT\r\n/, '')
      .replace(/TZID=W\. Europe Standard Time/g, 'TZID=Nowhere Standard Time')
      .replace('TZID:W. Europe Standard Time', 'TZID:Nowhere Standard Time');
    const out = editPreserving(broken, {
      start: new Date('2026-10-14T08:00:00Z'),
      end: new Date('2026-10-14T09:00:00Z'),
      allDay: false,
    });
    expect(out).toMatch(/DTSTART(;TZID=Nowhere Standard Time)?:20261014T08/);
  });
});

describe('moving a whole series across a change of clocks', () => {
  // Berlin's clocks go forward on Sunday 29 March 2026. Pinned here, since
  // all-day dates are the device's own days (bun applies the change; jest
  // keeps the machine's zone, where the all-day cases pass trivially).
  const zone = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'Europe/Berlin';
  });
  afterAll(() => {
    if (zone === undefined) delete process.env.TZ;
    else process.env.TZ = zone;
  });
  beforeEach(() => setWriteZone('Europe/Berlin'));

  const cal = (...lines: string[]) =>
    [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//test//EN',
      ...lines,
      'END:VCALENDAR',
    ].join('\r\n');
  const occurrences = (ics: string) =>
    expandEvents(ics, 'u', 'e', FROM, TO).sort(
      (a, b) => a.start.getTime() - b.start.getTime()
    );

  it('moves an all-day series by whole days', () => {
    // Mondays from 2 March, 16 March deleted.
    const ics = cal(
      'BEGIN:VEVENT',
      'UID:dst-1',
      'DTSTAMP:20260101T000000Z',
      'DTSTART;VALUE=DATE:20260302',
      'DTEND;VALUE=DATE:20260303',
      'RRULE:FREQ=WEEKLY;COUNT=8',
      'EXDATE;VALUE=DATE:20260316',
      'SUMMARY:Bins',
      'END:VEVENT'
    );
    const march23 = occurrences(ics).find((o) => o.start.getDate() === 23)!;
    const out = editPreserving(
      ics,
      {
        start: new Date(2026, 2, 30),
        end: new Date(2026, 2, 30), // the last day, as the editor gives it
        allDay: true,
      },
      march23.start
    );
    expect(out).toContain('DTSTART;VALUE=DATE:20260309');
    expect(out).toContain('DTEND;VALUE=DATE:20260310');
    expect(out).toContain('EXDATE;VALUE=DATE:20260323');
    const after = occurrences(out);
    expect(after.map((o) => o.start.getDay())).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect(after.some((o) => o.start.getDate() === 23)).toBe(false);
  });

  it('moves a timed series by days and keeps its time of day', () => {
    // Mondays 10:00 Berlin from 16 March; 6 April deleted, 30 March renamed.
    const ics = cal(
      'BEGIN:VEVENT',
      'UID:dst-2',
      'DTSTAMP:20260101T000000Z',
      'DTSTART;TZID=Europe/Berlin:20260316T100000',
      'DTEND;TZID=Europe/Berlin:20260316T110000',
      'RRULE:FREQ=WEEKLY;COUNT=6',
      'EXDATE;TZID=Europe/Berlin:20260406T100000',
      'SUMMARY:Planning',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:dst-2',
      'DTSTAMP:20260101T000000Z',
      'RECURRENCE-ID;TZID=Europe/Berlin:20260330T100000',
      'DTSTART;TZID=Europe/Berlin:20260330T100000',
      'DTEND;TZID=Europe/Berlin:20260330T110000',
      'SUMMARY:Planning (renamed)',
      'END:VEVENT'
    );
    const march23 = occurrences(ics).find((o) => o.start.getDate() === 23)!;
    // Tuesday 31 March 10:00, after the change: 8 days on.
    const out = editPreserving(
      ics,
      {
        start: new Date('2026-03-31T08:00:00Z'),
        end: new Date('2026-03-31T09:00:00Z'),
        allDay: false,
      },
      march23.start
    );
    expect(out).toContain('DTSTART;TZID=Europe/Berlin:20260324T100000');
    expect(out).toContain('DTEND;TZID=Europe/Berlin:20260324T110000');
    const after = occurrences(out);
    // Tuesdays 10:00 Berlin (UTC+1, then +2); 14 April stays deleted and 7
    // April keeps its new name.
    expect(after.map((o) => [o.start.toISOString(), o.summary])).toEqual([
      ['2026-03-24T09:00:00.000Z', 'Planning'],
      ['2026-03-31T08:00:00.000Z', 'Planning'],
      ['2026-04-07T08:00:00.000Z', 'Planning (renamed)'],
      ['2026-04-21T08:00:00.000Z', 'Planning'],
      ['2026-04-28T08:00:00.000Z', 'Planning'],
    ]);
  });

  it('keeps a multi-day all-day series its length', () => {
    const ics = cal(
      'BEGIN:VEVENT',
      'UID:dst-3',
      'DTSTAMP:20260101T000000Z',
      'DTSTART;VALUE=DATE:20260302',
      'DTEND;VALUE=DATE:20260304',
      'RRULE:FREQ=WEEKLY;COUNT=8',
      'SUMMARY:Away',
      'END:VEVENT'
    );
    const march23 = occurrences(ics).find((o) => o.start.getDate() === 23)!;
    // Sunday 29 to Monday 30: the first day is an hour short.
    const out = editPreserving(
      ics,
      {
        start: new Date(2026, 2, 29),
        end: new Date(2026, 2, 30),
        allDay: true,
      },
      march23.start
    );
    expect(out).toContain('DTSTART;VALUE=DATE:20260308');
    expect(out).toContain('DTEND;VALUE=DATE:20260310');
  });
});
