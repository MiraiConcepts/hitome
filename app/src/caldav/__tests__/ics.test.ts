import {
  buildEventICS,
  editPreserving,
  expandEvents,
  setWriteZone,
} from '../ics';

// UTC whatever the machine's zone: zones.test.ts covers writing in one.
beforeAll(() => setWriteZone('UTC'));
afterAll(() => setWriteZone(undefined));

// A realistic Apple-created event: carries VTIMEZONE, ORGANIZER, ATTENDEE and an
// X-APPLE-* extension — all of which MUST survive an edit (the plan's #1 risk).
const APPLE_EVENT = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'CALSCALE:GREGORIAN',
  'PRODID:-//Apple Inc.//macOS 26.5//EN',
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
  'UID:APPLE-UID-1',
  'DTSTAMP:20260601T000000Z',
  'DTSTART;TZID=Asia/Singapore:20260605T130000',
  'DTEND;TZID=Asia/Singapore:20260605T134500',
  'SUMMARY:Original title',
  'LOCATION:Office',
  'ORGANIZER;CN=Addison:mailto:addison@example.com',
  'ATTENDEE;CN=Duncan;ROLE=REQ-PARTICIPANT:mailto:duncan@example.com',
  'X-APPLE-STRUCTURED-LOCATION;VALUE=URI;X-TITLE=Office:geo:1.3,103.8',
  'SEQUENCE:2',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

describe('editPreserving', () => {
  it('changes only the target field and preserves unknown/Apple properties', () => {
    const out = editPreserving(APPLE_EVENT, { summary: 'New title' });

    expect(out).toContain('SUMMARY:New title');
    expect(out).not.toContain('SUMMARY:Original title');

    // the whole point: nothing else is dropped
    expect(out).toContain('X-APPLE-STRUCTURED-LOCATION');
    expect(out).toContain('ATTENDEE');
    expect(out).toContain('ORGANIZER');
    expect(out).toContain('LOCATION:Office');
  });

  it('bumps SEQUENCE on edit', () => {
    const out = editPreserving(APPLE_EVENT, { summary: 'x' });
    expect(out).toMatch(/SEQUENCE:3/); // 2 -> 3
  });

  it('leaves DTSTART;TZID byte-identical on a title-only edit', () => {
    const out = editPreserving(APPLE_EVENT, { summary: 'x' });
    expect(out).toContain('DTSTART;TZID=Asia/Singapore:20260605T130000');
    expect(out).toContain('DTEND;TZID=Asia/Singapore:20260605T134500');
  });

  it('leaves a foreign RRULE and VALARM byte-identical on a title-only edit', () => {
    const withRuleAndAlarm = APPLE_EVENT.replace(
      'SEQUENCE:2',
      [
        'RRULE:FREQ=WEEKLY;WKST=SU;UNTIL=20270101T000000Z;BYDAY=SA',
        'BEGIN:VALARM',
        'ACTION:AUDIO',
        'TRIGGER;VALUE=DATE-TIME:20260605T120000Z',
        'END:VALARM',
        'SEQUENCE:2',
      ].join('\r\n')
    );
    const out = editPreserving(withRuleAndAlarm, { summary: 'x' });
    expect(out).toContain(
      'RRULE:FREQ=WEEKLY;WKST=SU;UNTIL=20270101T000000Z;BYDAY=SA'
    );
    expect(out).toContain('TRIGGER;VALUE=DATE-TIME:20260605T120000Z');
    expect(out).toContain('ACTION:AUDIO');
  });

  it('adds and removes recurrence + alarm through changes', () => {
    const added = editPreserving(APPLE_EVENT, {
      recurrence: { preset: 'daily', count: 3 },
      alarm: { offsetMinutes: 10 },
    });
    expect(added).toContain('RRULE:FREQ=DAILY;COUNT=3');
    expect(added).toContain('TRIGGER:-PT10M');
    // Untouched DTSTART stays byte-identical even alongside new props.
    expect(added).toContain('DTSTART;TZID=Asia/Singapore:20260605T130000');

    const removed = editPreserving(added, { recurrence: null, alarm: null });
    expect(removed).not.toContain('RRULE');
    expect(removed).not.toContain('BEGIN:VALARM');
  });

  it('keeps a zoned event in its own zone, with one TZID', () => {
    const out = editPreserving(APPLE_EVENT, {
      start: new Date('2026-06-05T06:00:00Z'),
      end: new Date('2026-06-05T07:00:00Z'),
      allDay: false,
    });
    // 06:00Z is 14:00 in Singapore.
    expect(out).toContain('DTSTART;TZID=Asia/Singapore:20260605T140000');
    expect(out.match(/BEGIN:VTIMEZONE/g)).toHaveLength(1);
  });

  it('keeps all-day events VALUE=DATE with a non-inclusive DTEND', () => {
    const allDayEvent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//test//EN',
      'BEGIN:VEVENT',
      'UID:ALLDAY-1',
      'DTSTAMP:20260601T000000Z',
      'DTSTART;VALUE=DATE:20260621',
      'DTEND;VALUE=DATE:20260622',
      'SUMMARY:👽 Xuan',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const day = new Date(2026, 6, 10); // 2026-07-10 local
    const out = editPreserving(allDayEvent, {
      start: day,
      end: day,
      allDay: true,
    });
    expect(out).toContain('DTSTART;VALUE=DATE:20260710');
    expect(out).toContain('DTEND;VALUE=DATE:20260711'); // +1 day, non-inclusive
    expect(out).toContain('SUMMARY:👽 Xuan'); // emoji + untouched fields survive
  });
});

describe('buildEventICS', () => {
  it('produces a valid timed VEVENT written in UTC', () => {
    const ics = buildEventICS(
      {
        summary: 'Lunch',
        start: new Date('2026-07-02T12:00:00Z'),
        end: new Date('2026-07-02T13:00:00Z'),
        allDay: false,
      },
      'UID-2'
    );

    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('UID:UID-2');
    expect(ics).toContain('SUMMARY:Lunch');
    expect(ics).toMatch(/DTSTART:20260702T120000Z/);
  });

  it('writes recurrence and alarm on create', () => {
    const ics = buildEventICS(
      {
        summary: 'Standup',
        start: new Date('2026-07-06T04:00:00Z'),
        end: new Date('2026-07-06T04:15:00Z'),
        allDay: false,
        recurrence: { preset: 'daily', count: 5 },
        alarm: { offsetMinutes: 5 },
      },
      'UID-3'
    );
    expect(ics).toContain('RRULE:FREQ=DAILY;COUNT=5');
    expect(ics).toContain('BEGIN:VALARM');
    expect(ics).toContain('TRIGGER:-PT5M');
  });

  it('multi-day all-day events keep the exclusive DTEND', () => {
    const ics = buildEventICS(
      {
        summary: 'Trip',
        start: new Date(2026, 6, 10),
        end: new Date(2026, 6, 12), // inclusive UI end 2026-07-12
        allDay: true,
      },
      'UID-4'
    );
    expect(ics).toContain('DTSTART;VALUE=DATE:20260710');
    expect(ics).toContain('DTEND;VALUE=DATE:20260713'); // +1, non-inclusive
  });
});

describe('expandEvents', () => {
  const TIMED = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//test//EN',
    'BEGIN:VEVENT',
    'UID:COLOR-1',
    'DTSTAMP:20260601T000000Z',
    'DTSTART:20260610T090000Z',
    'DTEND:20260610T100000Z',
    'SUMMARY:Colored',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const start = new Date('2026-06-01T00:00:00Z');
  const end = new Date('2026-07-01T00:00:00Z');

  it('tags each event with the source calendar color + icon when provided', () => {
    const [ev] = expandEvents(TIMED, '/c/COLOR-1.ics', 'e1', start, end, {
      color: '#f8708cff',
      icon: 'gift',
    });
    expect(ev.color).toBe('#f8708cff');
    expect(ev.icon).toBe('gift');
  });

  it('omits color/icon entirely when the source is empty', () => {
    const [ev] = expandEvents(TIMED, '/c/COLOR-1.ics', 'e1', start, end, {});
    expect('color' in ev).toBe(false);
    expect('icon' in ev).toBe(false);
  });
});
