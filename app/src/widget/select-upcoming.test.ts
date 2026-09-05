import type { CalEvent } from '@/caldav/types';

import {
  UPCOMING_LIMIT,
  selectUpcoming,
  toWidgetEvent,
} from './select-upcoming';

function mkEvent(
  summary: string,
  start: Date,
  end: Date,
  allDay = false
): CalEvent {
  return {
    id: `${summary}:${start.toISOString()}`,
    url: `/dav/${summary}.ics`,
    etag: '"1"',
    uid: summary,
    summary,
    start,
    end,
    allDay,
    raw: '',
  };
}

const now = new Date(2026, 6, 7, 12, 0); // Tue 7 Jul 2026, noon

describe('selectUpcoming', () => {
  it('drops past events and sorts the rest by start', () => {
    const past = mkEvent(
      'past',
      new Date(2026, 6, 7, 9, 0),
      new Date(2026, 6, 7, 10, 0)
    );
    const later = mkEvent(
      'later',
      new Date(2026, 6, 9, 9, 0),
      new Date(2026, 6, 9, 10, 0)
    );
    const soon = mkEvent(
      'soon',
      new Date(2026, 6, 7, 15, 0),
      new Date(2026, 6, 7, 16, 0)
    );
    expect(
      selectUpcoming([past, later, soon], now).map((e) => e.summary)
    ).toEqual(['soon', 'later']);
  });

  it('keeps an event that is in progress at now', () => {
    const running = mkEvent(
      'running',
      new Date(2026, 6, 7, 11, 0),
      new Date(2026, 6, 7, 13, 0)
    );
    expect(selectUpcoming([running], now)).toHaveLength(1);
  });

  it('keeps a today all-day event (exclusive end at next midnight)', () => {
    const allDay = mkEvent(
      'holiday',
      new Date(2026, 6, 7),
      new Date(2026, 6, 8),
      true
    );
    const yesterday = mkEvent(
      'gone',
      new Date(2026, 6, 6),
      new Date(2026, 6, 7),
      true
    );
    expect(
      selectUpcoming([allDay, yesterday], now).map((e) => e.summary)
    ).toEqual(['holiday']);
  });

  it('caps at the limit, counting each recurring instance separately', () => {
    const instances = Array.from({ length: UPCOMING_LIMIT + 2 }, (_, i) =>
      mkEvent(
        'standup',
        new Date(2026, 6, 8 + i, 9, 0),
        new Date(2026, 6, 8 + i, 9, 15)
      )
    );
    expect(selectUpcoming(instances, now)).toHaveLength(UPCOMING_LIMIT);
  });
});

describe('toWidgetEvent', () => {
  it('serializes dates and keeps location only when present', () => {
    const event = mkEvent(
      'lunch',
      new Date(Date.UTC(2026, 6, 8, 4, 0)),
      new Date(Date.UTC(2026, 6, 8, 5, 0))
    );
    expect(toWidgetEvent({ ...event, location: 'Lau Pa Sat' })).toEqual({
      id: 'lunch:2026-07-08T04:00:00.000Z',
      summary: 'lunch',
      start: '2026-07-08T04:00:00.000Z',
      end: '2026-07-08T05:00:00.000Z',
      allDay: false,
      location: 'Lau Pa Sat',
    });
    expect('location' in toWidgetEvent(event)).toBe(false);
  });

  it('joins multi-line locations onto one line (Apple venue\\naddress)', () => {
    const event = mkEvent(
      'talk',
      new Date(Date.UTC(2026, 7, 1, 1, 0)),
      new Date(Date.UTC(2026, 7, 1, 2, 0))
    );
    expect(
      toWidgetEvent({
        ...event,
        location:
          'Singapore Chinese Cultural Centre\n1 Straits Blvd, Singapore 018906',
      }).location
    ).toBe(
      'Singapore Chinese Cultural Centre, 1 Straits Blvd, Singapore 018906'
    );
  });

  it('normalizes scheme-less links and keeps recurring only when true', () => {
    const event = mkEvent(
      'standup',
      new Date(Date.UTC(2026, 7, 1, 1, 0)),
      new Date(Date.UTC(2026, 7, 1, 2, 0))
    );
    const bare = toWidgetEvent({ ...event, link: 'google.com' });
    expect(bare.link).toBe('https://google.com');
    expect('meetingLink' in bare).toBe(false);
    const flagged = toWidgetEvent({ ...event, recurring: true, alarm: true });
    expect(flagged.recurring).toBe(true);
    expect(flagged.alarm).toBe(true);
    expect('recurring' in toWidgetEvent(event)).toBe(false);
    expect('link' in toWidgetEvent(event)).toBe(false);
    expect('alarm' in toWidgetEvent(event)).toBe(false);
  });

  it('carries the source calendar color + icon only when present', () => {
    const event = mkEvent(
      'birthday',
      new Date(Date.UTC(2026, 7, 1, 0, 0)),
      new Date(Date.UTC(2026, 7, 2, 0, 0))
    );
    const tagged = toWidgetEvent({
      ...event,
      color: '#f8708cff',
      icon: 'gift',
    });
    expect(tagged.color).toBe('#f8708cff');
    expect(tagged.icon).toBe('gift');
    expect('color' in toWidgetEvent(event)).toBe(false);
    expect('icon' in toWidgetEvent(event)).toBe(false);
  });

  it('routes meeting links to meetingLink, without a duplicate link line', () => {
    const event = mkEvent(
      'standup',
      new Date(Date.UTC(2026, 7, 1, 1, 0)),
      new Date(Date.UTC(2026, 7, 1, 2, 0))
    );
    const meeting = toWidgetEvent({
      ...event,
      link: 'meet.google.com/abc',
    });
    expect(meeting.meetingLink).toBe('https://meet.google.com/abc');
    expect('link' in meeting).toBe(false);
    const both = toWidgetEvent({
      ...event,
      link: 'https://example.com/agenda',
      description: 'Join: https://zoom.us/j/9',
    });
    expect(both.meetingLink).toBe('https://zoom.us/j/9');
    expect(both.link).toBe('https://example.com/agenda');
  });
});
