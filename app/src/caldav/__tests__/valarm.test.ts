import ICAL from 'ical.js';

import { alarmTimeFor, applyAlarm, readAlarm } from '../valarm';

function buildIcs(veventLines: string[]): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//test//EN',
    'BEGIN:VEVENT',
    'UID:A-1',
    'DTSTAMP:20260601T000000Z',
    'DTSTART:20260706T040000Z',
    'SUMMARY:x',
    ...veventLines,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

function firstVevent(ics: string): ICAL.Component {
  return new ICAL.Component(ICAL.parse(ics)).getFirstSubcomponent('vevent')!;
}

describe('applyAlarm', () => {
  it('adds a DISPLAY alarm with a negative duration trigger', () => {
    const vevent = firstVevent(buildIcs([]));
    applyAlarm(vevent, { offsetMinutes: 10 });
    const out = vevent.toString();
    expect(out).toContain('BEGIN:VALARM');
    expect(out).toContain('ACTION:DISPLAY');
    expect(out).toContain('TRIGGER:-PT10M');
  });

  it('writes the all-day presets (morning-of / day-before 9:00)', () => {
    const vevent = firstVevent(buildIcs([]));
    applyAlarm(vevent, { offsetMinutes: -540 }); // 9h AFTER midnight start
    expect(vevent.toString()).toContain('TRIGGER:PT9H');
    applyAlarm(vevent, { offsetMinutes: 900 }); // 15h before midnight
    expect(vevent.toString()).toContain('TRIGGER:-PT15H');
  });

  it('replaces in place, preserving foreign props on our alarm', () => {
    const vevent = firstVevent(
      buildIcs([
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        'DESCRIPTION:Reminder',
        'TRIGGER:-PT30M',
        'X-APPLE-DEFAULT-ALARM:TRUE',
        'END:VALARM',
      ])
    );
    applyAlarm(vevent, { offsetMinutes: 5 });
    const out = vevent.toString();
    expect(out).toContain('TRIGGER:-PT5M');
    expect(out).not.toContain('TRIGGER:-PT30M');
    expect(out).toContain('X-APPLE-DEFAULT-ALARM:TRUE');
    expect(out.match(/BEGIN:VALARM/g)).toHaveLength(1);
  });

  it('removes only OUR alarm, leaving foreign alarms alone', () => {
    const vevent = firstVevent(
      buildIcs([
        'BEGIN:VALARM',
        'ACTION:EMAIL',
        'DESCRIPTION:mail me',
        'TRIGGER:-PT1H',
        'END:VALARM',
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        'DESCRIPTION:Reminder',
        'TRIGGER:-PT10M',
        'END:VALARM',
      ])
    );
    applyAlarm(vevent, null);
    const out = vevent.toString();
    expect(out).toContain('ACTION:EMAIL'); // foreign survives
    expect(out).not.toContain('TRIGGER:-PT10M'); // ours gone
  });

  it('never touches absolute-time or RELATED=END alarms', () => {
    const abs = buildIcs([
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:abs',
      'TRIGGER;VALUE=DATE-TIME:20260706T030000Z',
      'END:VALARM',
    ]);
    const vevent = firstVevent(abs);
    applyAlarm(vevent, null); // "remove" finds nothing of ours
    expect(vevent.toString()).toContain('TRIGGER;VALUE=DATE-TIME');
  });
});

describe('readAlarm', () => {
  it('null with no alarms', () => {
    expect(readAlarm(buildIcs([]))).toBeNull();
  });

  it('reads our duration trigger back in minutes', () => {
    const ics = buildIcs([
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:Reminder',
      'TRIGGER:-PT45M',
      'END:VALARM',
    ]);
    expect(readAlarm(ics)).toEqual({ offsetMinutes: 45 });
  });

  it('accepts TRIGGER;VALUE=DURATION (explicit param) as ours', () => {
    const ics = buildIcs([
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:Reminder',
      'TRIGGER;VALUE=DURATION:-P1D',
      'END:VALARM',
    ]);
    expect(readAlarm(ics)).toEqual({ offsetMinutes: 1440 });
  });

  it("'foreign' for absolute-time and RELATED=END triggers", () => {
    expect(
      readAlarm(
        buildIcs([
          'BEGIN:VALARM',
          'ACTION:DISPLAY',
          'DESCRIPTION:abs',
          'TRIGGER;VALUE=DATE-TIME:20260706T030000Z',
          'END:VALARM',
        ])
      )
    ).toBe('foreign');
    expect(
      readAlarm(
        buildIcs([
          'BEGIN:VALARM',
          'ACTION:DISPLAY',
          'DESCRIPTION:end-rel',
          'TRIGGER;RELATED=END:-PT5M',
          'END:VALARM',
        ])
      )
    ).toBe('foreign');
  });
});

describe('alarmTimeFor', () => {
  it('fires offset before the given occurrence start', () => {
    const ics = buildIcs([
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:Reminder',
      'TRIGGER:-PT10M',
      'END:VALARM',
    ]);
    const occStart = new Date('2026-07-13T04:00:00Z'); // a later occurrence
    expect(alarmTimeFor(ics, occStart)?.toISOString()).toBe(
      '2026-07-13T03:50:00.000Z'
    );
  });

  it('null when no editable alarm', () => {
    expect(alarmTimeFor(buildIcs([]), new Date())).toBeNull();
  });
});

describe('an occurrence with its own reminder', () => {
  // Weekly, 10 minutes before; the 13 July occurrence alone set to an hour.
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//test//EN',
    'BEGIN:VEVENT',
    'UID:A-1',
    'DTSTAMP:20260601T000000Z',
    'DTSTART:20260706T040000Z',
    'RRULE:FREQ=WEEKLY',
    'SUMMARY:x',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Reminder',
    'TRIGGER:-PT10M',
    'END:VALARM',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:A-1',
    'DTSTAMP:20260601T000000Z',
    'RECURRENCE-ID:20260713T040000Z',
    'DTSTART:20260713T040000Z',
    'SUMMARY:x',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Reminder',
    'TRIGGER:-PT1H',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const own = Date.UTC(2026, 6, 13, 4) / 1000;
  const other = Date.UTC(2026, 6, 20, 4) / 1000;

  it('reads that occurrence its own reminder, the others the series', () => {
    expect(readAlarm(ics, own)).toEqual({ offsetMinutes: 60 });
    expect(readAlarm(ics, other)).toEqual({ offsetMinutes: 10 });
    expect(readAlarm(ics)).toEqual({ offsetMinutes: 10 });
  });

  it('rings that occurrence by its own reminder', () => {
    expect(alarmTimeFor(ics, new Date(own * 1000), own)?.toISOString()).toBe(
      '2026-07-13T03:00:00.000Z'
    );
    expect(
      alarmTimeFor(ics, new Date(other * 1000), other)?.toISOString()
    ).toBe('2026-07-20T03:50:00.000Z');
  });
});
