import { expandEvents, markGoing } from '../ics';
import { readAlarm } from '../valarm';

// Marking a tray event going, on the showing the Filmhouse feed writes
// (radicale/feeds): the feed owns SUMMARY, DTSTART, DTEND, DURATION, URL,
// DESCRIPTION, STATUS and DTSTAMP and keeps everything else, so hitome
// writes only TRANSP and its own VALARM.
const SHOWING = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//catallenya//filmhouse//EN',
  'BEGIN:VEVENT',
  'UID:filmhouse-1813@hitome',
  'DTSTAMP:20261012T024500Z',
  'DTSTART:20261013T084500Z',
  'DTEND:20261013T103900Z',
  'SUMMARY:The Violinist',
  'URL:https://filmhouse.sg/filmhouse-singapore/booknow/1813',
  'DESCRIPTION:Book: https://filmhouse.sg/filmhouse-singapore/booknow/1813\\nFi',
  ' lm: https://filmhouse.sg/film/195/the-violinist\\n114 min · PG',
  'STATUS:CONFIRMED',
  'TRANSP:TRANSPARENT',
  'X-FEED-NOTE:kept',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

const OCT = [
  new Date('2026-10-01T00:00:00Z'),
  new Date('2026-11-01T00:00:00Z'),
] as const;
const read = (ics: string) => expandEvents(ics, 'u', 'e', ...OCT)[0];

describe('markGoing', () => {
  it('marks busy with the reminder, leaving the feed fields as they were', () => {
    const going = markGoing(SHOWING, true, { offsetMinutes: 30 });
    const e = read(going);
    expect(e.free).toBeUndefined();
    expect(e.alarm).toBe(true);
    expect(readAlarm(going)).toEqual({ offsetMinutes: 30 });
    const before = read(SHOWING);
    expect(e.summary).toBe(before.summary);
    expect(e.start).toEqual(before.start);
    expect(e.end).toEqual(before.end);
    expect(e.link).toBe(before.link);
    expect(e.description).toBe(before.description);
    expect(going).toContain('X-FEED-NOTE:kept');
    expect(going).toContain('TRANSP:OPAQUE');
  });

  it('marks going without a reminder when there is no default alert', () => {
    const e = read(markGoing(SHOWING, true, null));
    expect(e.free).toBeUndefined();
    expect(e.alarm).toBeUndefined();
  });

  it('keeps a reminder the event already has', () => {
    const once = markGoing(SHOWING, true, { offsetMinutes: 30 });
    expect(readAlarm(markGoing(once, true, { offsetMinutes: 10 }))).toEqual({
      offsetMinutes: 30,
    });
  });

  it('unmarks to free, written out, and takes the reminder away', () => {
    const back = markGoing(
      markGoing(SHOWING, true, { offsetMinutes: 30 }),
      false,
      null
    );
    const e = read(back);
    expect(e.free).toBe(true);
    expect(e.alarm).toBeUndefined();
    expect(back).toContain('TRANSP:TRANSPARENT');
    expect(back).toContain('X-FEED-NOTE:kept');
  });

  it('writes TRANSP out when the event had none (a missing one is busy)', () => {
    const bare = SHOWING.replace('TRANSP:TRANSPARENT\r\n', '');
    expect(read(bare).free).toBeUndefined();
    expect(read(markGoing(bare, false, null)).free).toBe(true);
  });
});
