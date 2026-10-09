import type { CalEvent } from '@/caldav/types';

import { setClock24 } from './date';
import { eventShareText, whenText } from './event-text';

setClock24(true);

const event = (over: Partial<CalEvent>): CalEvent => ({
  id: 'u:1',
  url: 'store:1/1',
  etag: '',
  raw: '',
  uid: 'u',
  summary: 'Flat viewing',
  start: new Date(2026, 9, 3, 14, 0),
  end: new Date(2026, 9, 3, 15, 0),
  allDay: false,
  ...over,
});

describe('whenText', () => {
  it('gives a timed event its day, year and span', () => {
    const text = whenText(event({}));
    expect(text).toContain('2026');
    expect(text).toContain('14:00 to 15:00');
  });

  it('names both days of one that crosses midnight', () => {
    const text = whenText(
      event({
        end: new Date(2026, 9, 4, 1, 0),
        start: new Date(2026, 9, 3, 23),
      })
    );
    expect(text).toMatch(/23:00 to .*2026, 01:00$/);
  });

  it('says a one-day all-day event is all day', () => {
    const text = whenText(
      event({
        allDay: true,
        start: new Date(2026, 9, 3),
        end: new Date(2026, 9, 4), // exclusive: the day after its last
      })
    );
    expect(text).toMatch(/, all day$/);
  });

  it('gives a several-day all-day event its first and last day', () => {
    const text = whenText(
      event({
        allDay: true,
        start: new Date(2026, 9, 3),
        end: new Date(2026, 9, 6), // exclusive: last day is the 5th
      })
    );
    expect(text).toContain(' to ');
    expect(text).not.toContain('all day');
    expect(text.split(' to ')[1]).toContain('5');
  });
});

describe('eventShareText', () => {
  it('is the title, when, place and meeting link, a line each', () => {
    const lines = eventShareText(
      event({
        location: 'Kreta Ayer People’s Theatre, Singapore',
        link: 'https://zoom.us/j/123456789',
        description: 'Dial-in passcode 4321, bring the keys',
      })
    ).split('\n');
    expect(lines[0]).toBe('Flat viewing');
    expect(lines[1]).toContain('14:00 to 15:00');
    expect(lines).toContain('Kreta Ayer People’s Theatre, Singapore');
    expect(lines.some((l) => l.startsWith('Join: https://zoom.us/'))).toBe(
      true
    );
  });

  it('leaves the notes out', () => {
    const text = eventShareText(
      event({ description: 'passcode 4321, private details' })
    );
    expect(text).not.toContain('passcode');
  });

  it('shares a location that is really a join link as the link, not a place', () => {
    const lines = eventShareText(
      event({ location: 'https://meet.google.com/abc-defg-hij' })
    ).split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[2]).toBe('Join: https://meet.google.com/abc-defg-hij');
  });

  it('calls an event with no title untitled', () => {
    expect(eventShareText(event({ summary: '  ' })).split('\n')[0]).toBe(
      '(untitled)'
    );
  });
});
