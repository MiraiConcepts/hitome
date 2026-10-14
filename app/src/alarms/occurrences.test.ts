import type { CalEvent } from '@/caldav/types';

import { desiredAlarms } from './occurrences';
import { planReconcile } from './reconcile';

const NOW = new Date('2026-07-19T10:00:00Z');

function makeEvent(overrides: Partial<CalEvent> & { start: Date }): CalEvent {
  const raw = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//test//EN',
    'BEGIN:VEVENT',
    `UID:${overrides.uid ?? 'U1'}`,
    'DTSTAMP:20260601T000000Z',
    'DTSTART:20260720T090000Z',
    'SUMMARY:x',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Reminder',
    'TRIGGER:-PT10M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  return {
    id: `${overrides.uid ?? 'U1'}:${overrides.start.toISOString()}`,
    url: 'u',
    etag: 'e',
    uid: 'U1',
    summary: 'Standup',
    end: new Date(overrides.start.getTime() + 3_600_000),
    allDay: false,
    alarm: true,
    raw,
    ...overrides,
  };
}

describe('desiredAlarms', () => {
  it('one alarm per future occurrence within the horizon', () => {
    const occ1 = makeEvent({ start: new Date('2026-07-20T09:00:00Z') });
    const occ2 = makeEvent({ start: new Date('2026-07-21T09:00:00Z') });
    const out = desiredAlarms([occ1, occ2], NOW);
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe(
      `alarm:U1:${new Date('2026-07-20T09:00:00Z').getTime() / 1000}`
    );
    expect(out[0].fireDate.toISOString()).toBe('2026-07-20T08:50:00.000Z');
    expect(out[0].day).toBeTruthy();
  });

  it('skips past fire times, beyond-horizon occurrences, and alarmless events', () => {
    const past = makeEvent({ start: new Date('2026-07-19T09:00:00Z') });
    const far = makeEvent({ start: new Date('2026-09-01T09:00:00Z') });
    const noAlarm = makeEvent({
      start: new Date('2026-07-20T09:00:00Z'),
      alarm: undefined,
    });
    expect(desiredAlarms([past, far, noAlarm], NOW)).toHaveLength(0);
  });

  it('never rings for a cancelled event', () => {
    const cancelled = makeEvent({
      start: new Date('2026-07-20T09:00:00Z'),
      cancelled: true,
    });
    expect(desiredAlarms([cancelled], NOW)).toHaveLength(0);
  });

  it('dedupes repeated occurrences from overlapping fetches', () => {
    const occ = makeEvent({ start: new Date('2026-07-20T09:00:00Z') });
    expect(desiredAlarms([occ, { ...occ }], NOW)).toHaveLength(1);
  });

  it('includes location in the body when present', () => {
    const withLoc = makeEvent({
      start: new Date('2026-07-20T09:00:00Z'),
      location: 'Office',
    });
    expect(desiredAlarms([withLoc], NOW)[0].body).toContain('Office');
  });
});

describe('planReconcile', () => {
  const alarm = desiredAlarms(
    [makeEvent({ start: new Date('2026-07-20T09:00:00Z') })],
    NOW
  )[0];

  it('cancels stale alarm ids, leaves foreign identifiers alone', () => {
    const plan = planReconcile([alarm], ['alarm:GONE:1', 'other:id', alarm.id]);
    expect(plan.toCancel).toEqual(['alarm:GONE:1']);
  });

  it('re-schedules every desired alarm (store may lie after force-stop)', () => {
    const plan = planReconcile([alarm], [alarm.id]);
    expect(plan.toSchedule).toEqual([alarm]);
  });

  it('is idempotent', () => {
    const first = planReconcile([alarm], []);
    const again = planReconcile(
      first.toSchedule,
      first.toSchedule.map((a) => a.id)
    );
    expect(again.toCancel).toEqual([]);
    expect(again.toSchedule).toEqual([alarm]);
  });
});
