import type { CalEvent } from '@/caldav/types';

import { endDayForAllDay, initialFormState, isDirty } from './editor-state';

const NOW = new Date(2026, 6, 19, 14, 20); // local 2026-07-19 14:20

function makeEvent(
  overrides: Partial<CalEvent>,
  veventLines: string[] = []
): CalEvent {
  const raw = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//test//EN',
    'BEGIN:VEVENT',
    'UID:P-1',
    'DTSTAMP:20260601T000000Z',
    'DTSTART:20260720T090000Z',
    'SUMMARY:x',
    ...veventLines,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  return {
    id: 'P-1:x',
    url: 'u',
    etag: 'e',
    uid: 'P-1',
    summary: 'Standup',
    start: new Date(2026, 6, 20, 9, 0),
    end: new Date(2026, 6, 20, 10, 30),
    allDay: false,
    raw,
    ...overrides,
  };
}

describe('initialFormState', () => {
  it('create mode: defaultDay + next-full-hour times', () => {
    const s = initialFormState(null, '2026-07-25', NOW);
    expect(s.startDay).toBe('2026-07-25');
    expect(s.endDay).toBe('2026-07-25');
    expect(s.startTime).toBe('15:00');
    expect(s.endTime).toBe('16:00');
    expect(s.recurrence).toEqual({ kind: 'none' });
    expect(s.alarm).toEqual({ kind: 'none' });
  });

  it('ends a late-evening new event on the next day', () => {
    const s = initialFormState(
      null,
      '2026-10-06',
      new Date(2026, 9, 4, 22, 37)
    );
    expect([s.startDay, s.startTime]).toEqual(['2026-10-06', '23:00']);
    expect([s.endDay, s.endTime]).toEqual(['2026-10-07', '00:00']);
  });

  it('starts a new event with the default alert from settings', () => {
    expect(initialFormState(null, '2026-07-25', NOW, 10).alarm).toEqual({
      kind: 'set',
      offsetMinutes: 10,
    });
    expect(initialFormState(null, '2026-07-25', NOW, null).alarm).toEqual({
      kind: 'none',
    });
  });

  it('edit timed: days and times from the event', () => {
    const s = initialFormState(makeEvent({}), '2026-07-01', NOW);
    expect(s.summary).toBe('Standup');
    expect(s.startDay).toBe('2026-07-20');
    expect(s.startTime).toBe('09:00');
    expect(s.endDay).toBe('2026-07-20');
    expect(s.endTime).toBe('10:30');
  });

  it('edit all-day: exclusive DTEND shown as the inclusive day', () => {
    const s = initialFormState(
      makeEvent({
        allDay: true,
        start: new Date(2026, 6, 10),
        end: new Date(2026, 6, 13), // exclusive: covers 10–12
      }),
      '2026-07-01',
      NOW
    );
    expect(s.startDay).toBe('2026-07-10');
    expect(s.endDay).toBe('2026-07-12');
  });

  it('edit all-day degenerate (end === start) clamps to the start day', () => {
    const day = new Date(2026, 6, 10);
    const s = initialFormState(
      makeEvent({ allDay: true, start: day, end: day }),
      '2026-07-01',
      NOW
    );
    expect(s.endDay).toBe('2026-07-10');
  });

  it('prefills a preset recurrence and our alarm from raw ICS', () => {
    const s = initialFormState(
      makeEvent({ recurring: true, alarm: true }, [
        'RRULE:FREQ=DAILY;COUNT=4',
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        'DESCRIPTION:Reminder',
        'TRIGGER:-PT30M',
        'END:VALARM',
      ]),
      '2026-07-01',
      NOW
    );
    expect(s.recurrence).toEqual({
      kind: 'preset',
      preset: 'daily',
      end: { type: 'count', n: 4 },
    });
    expect(s.alarm).toEqual({ kind: 'set', offsetMinutes: 30 });
  });

  it('complex rules and foreign alarms prefill as read-only states', () => {
    const s = initialFormState(
      makeEvent({ recurring: true, alarm: true }, [
        'RRULE:FREQ=WEEKLY;INTERVAL=2',
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        'DESCRIPTION:abs',
        'TRIGGER;VALUE=DATE-TIME:20260720T080000Z',
        'END:VALARM',
      ]),
      '2026-07-01',
      NOW
    );
    expect(s.recurrence).toEqual({ kind: 'custom' });
    expect(s.alarm).toEqual({ kind: 'foreign' });
  });
});

describe('endDayForAllDay', () => {
  const late = {
    startDay: '2026-10-04',
    startTime: '23:00',
    endDay: '2026-10-05',
    endTime: '00:00',
  };

  it('makes 23:00 → midnight one all-day day', () => {
    expect(endDayForAllDay(true, late)).toBe('2026-10-04');
  });

  it('puts the end back on the next day when All-day goes off again', () => {
    const collapsed = { ...late, endDay: endDayForAllDay(true, late) };
    expect(endDayForAllDay(false, collapsed)).toBe('2026-10-05');
  });

  it('keeps both days of a real two-day timed span', () => {
    expect(
      endDayForAllDay(true, {
        startDay: '2026-10-09',
        startTime: '10:00',
        endDay: '2026-10-10',
        endTime: '09:00',
      })
    ).toBe('2026-10-10');
  });

  it('leaves a same-day timed event alone either way', () => {
    const day = {
      startDay: '2026-10-09',
      startTime: '09:00',
      endDay: '2026-10-09',
      endTime: '10:00',
    };
    expect(endDayForAllDay(true, day)).toBe('2026-10-09');
    expect(endDayForAllDay(false, day)).toBe('2026-10-09');
  });

  it('pulls an end before the start up to it', () => {
    expect(endDayForAllDay(true, { ...late, endDay: '2026-10-01' })).toBe(
      '2026-10-04'
    );
  });
});

describe('isDirty', () => {
  const fresh = () => initialFormState(null, '2026-07-25', NOW, 10);

  it('a new event left at its defaults is not dirty', () => {
    expect(isDirty(fresh(), fresh())).toBe(false);
  });

  it('an opened event left alone is not dirty', () => {
    const e = makeEvent({ location: 'Room 1' }, ['RRULE:FREQ=WEEKLY;COUNT=4']);
    expect(
      isDirty(initialFormState(e, '', NOW), initialFormState(e, '', NOW))
    ).toBe(false);
  });

  it('any typed or changed field makes it dirty', () => {
    const base = fresh();
    const changes: Partial<typeof base>[] = [
      { summary: 'Lunch' },
      { summary: ' ' },
      { allDay: true },
      { startDay: '2026-07-26' },
      { startTime: '09:00' },
      { endDay: '2026-07-27' },
      { endTime: '23:00' },
      { location: 'Cafe' },
      { description: 'Bring cake' },
      {
        recurrence: {
          kind: 'preset',
          preset: 'daily',
          end: { type: 'forever' },
        },
      },
      { alarm: { kind: 'none' } },
      { alarm: { kind: 'set', offsetMinutes: 30 } },
    ];
    for (const change of changes)
      expect(isDirty(base, { ...base, ...change })).toBe(true);
  });

  it('a repeat count or end date edited counts, an equal one does not', () => {
    const repeat = {
      kind: 'preset' as const,
      preset: 'weekly' as const,
      end: { type: 'count' as const, n: 4 },
    };
    const base = { ...fresh(), recurrence: repeat };
    expect(isDirty(base, { ...base, recurrence: { ...repeat } })).toBe(false);
    expect(
      isDirty(base, {
        ...base,
        recurrence: { ...repeat, end: { type: 'count', n: 5 } },
      })
    ).toBe(true);
  });

  it('a calendar counts once both sides are known', () => {
    const base = fresh();
    expect(isDirty(base, { ...base, calendarUrl: '/a/' })).toBe(false);
    expect(
      isDirty({ ...base, calendarUrl: '/a/' }, { ...base, calendarUrl: '/a/' })
    ).toBe(false);
    expect(
      isDirty({ ...base, calendarUrl: '/a/' }, { ...base, calendarUrl: '/b/' })
    ).toBe(true);
  });
});
