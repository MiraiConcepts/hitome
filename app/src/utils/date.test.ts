import { eventDays, nextFullHour, parseDayTime, toDateString } from './date';

describe('toDateString', () => {
  it('formats local dates with zero padding', () => {
    expect(toDateString(new Date(2026, 6, 4))).toBe('2026-07-04');
    expect(toDateString(new Date(2026, 0, 31))).toBe('2026-01-31');
  });
});

describe('eventDays', () => {
  it('covers a timed event on a single day', () => {
    expect(
      eventDays(new Date(2026, 6, 2, 15, 0), new Date(2026, 6, 2, 16, 0))
    ).toEqual(['2026-07-02']);
  });

  it('treats the end as exclusive (all-day non-inclusive DTEND)', () => {
    expect(eventDays(new Date(2026, 6, 2), new Date(2026, 6, 3))).toEqual([
      '2026-07-02',
    ]);
  });

  it('spans multi-day events', () => {
    expect(eventDays(new Date(2026, 6, 2), new Date(2026, 6, 5))).toEqual([
      '2026-07-02',
      '2026-07-03',
      '2026-07-04',
    ]);
  });

  it('keeps a small-hours end (≤ 06:00) on the start day', () => {
    expect(
      eventDays(new Date(2026, 6, 3, 18, 0), new Date(2026, 6, 4, 1, 30))
    ).toEqual(['2026-07-03']);
    expect(
      eventDays(new Date(2026, 6, 3, 23, 0), new Date(2026, 6, 4, 6, 0))
    ).toEqual(['2026-07-03']);
  });

  it('claims the end day once the end passes 06:00', () => {
    expect(
      eventDays(new Date(2026, 6, 3, 23, 0), new Date(2026, 6, 4, 6, 1))
    ).toEqual(['2026-07-03', '2026-07-04']);
    expect(
      eventDays(new Date(2026, 6, 3, 23, 0), new Date(2026, 6, 4, 9, 40))
    ).toEqual(['2026-07-03', '2026-07-04']);
  });

  it('never rolls a same-day small-hours event off its own day', () => {
    expect(
      eventDays(new Date(2026, 6, 4, 0, 30), new Date(2026, 6, 4, 1, 30))
    ).toEqual(['2026-07-04']);
  });

  it('rolls only the final day back on longer spans', () => {
    expect(
      eventDays(new Date(2026, 6, 3, 18, 0), new Date(2026, 6, 5, 1, 30))
    ).toEqual(['2026-07-03', '2026-07-04']);
  });
});

describe('parseDayTime', () => {
  it('parses valid input', () => {
    const d = parseDayTime('2026-07-02', '15:30');
    expect(d?.getHours()).toBe(15);
    expect(toDateString(d!)).toBe('2026-07-02');
  });

  it('rejects malformed and rolled-over dates', () => {
    expect(parseDayTime('2026-02-31', '10:00')).toBeNull();
    expect(parseDayTime('2026-07-02', '25:00')).toBeNull();
    expect(parseDayTime('02/07/2026', '10:00')).toBeNull();
  });
});

describe('nextFullHour', () => {
  it('rounds up to the next hour', () => {
    expect(nextFullHour(new Date(2026, 6, 2, 14, 23)).getHours()).toBe(15);
    expect(nextFullHour(new Date(2026, 6, 2, 14, 0)).getHours()).toBe(15);
  });
});
