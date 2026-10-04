import {
  buildEventICS,
  editPreserving,
  expandEvents,
  setWriteZone,
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
