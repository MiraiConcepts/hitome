import type { CalEvent } from '@/caldav/types';

import { onCalendar, roleOf } from './calendar-visibility';

const roles = { hidden: ['store:2/'], tray: ['store:3/'] };
const now = new Date(2026, 9, 13, 12);

function event(
  url: string,
  flags: Partial<Pick<CalEvent, 'free' | 'cancelled' | 'end'>> = {}
) {
  return { url, end: new Date(2026, 9, 20, 22), ...flags };
}

describe('calendar roles', () => {
  it('finds the role of a calendar or one of its events', () => {
    expect(roleOf('store:1/', roles)).toBe('shown');
    expect(roleOf('store:2/', roles)).toBe('hidden');
    expect(roleOf('store:3/events/9', roles)).toBe('tray');
  });

  it('draws shown events unless cancelled', () => {
    expect(onCalendar(event('store:1/4'), roles, now)).toBe(true);
    expect(onCalendar(event('store:1/4', { free: true }), roles, now)).toBe(
      true
    );
    expect(
      onCalendar(event('store:1/4', { cancelled: true }), roles, now)
    ).toBe(false);
  });

  it('never draws hidden events', () => {
    expect(onCalendar(event('store:2/5'), roles, now)).toBe(false);
  });

  it('draws tray events only when going', () => {
    expect(onCalendar(event('store:3/6', { free: true }), roles, now)).toBe(
      false
    );
    expect(onCalendar(event('store:3/6'), roles, now)).toBe(true);
  });

  it('draws a cancelled going event until its day has passed', () => {
    const cancelled = (end: Date) =>
      onCalendar(event('store:3/6', { cancelled: true, end }), roles, now);
    expect(cancelled(new Date(2026, 9, 20, 22))).toBe(true);
    // Earlier today: still today.
    expect(cancelled(new Date(2026, 9, 13, 9))).toBe(true);
    expect(cancelled(new Date(2026, 9, 12, 22))).toBe(false);
    // An all-day event of yesterday ends at today's midnight: passed.
    expect(cancelled(new Date(2026, 9, 13, 0))).toBe(false);
    // Not going: not drawn, cancelled or not.
    expect(
      onCalendar(
        event('store:3/6', { cancelled: true, free: true }),
        roles,
        now
      )
    ).toBe(false);
  });
});
