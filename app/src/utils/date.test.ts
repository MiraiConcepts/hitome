import {
  agoLabel,
  eventDays,
  nextFullHour,
  parseDayTime,
  toDateString,
} from './date';

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

  it('claims the end day whenever a timed event crosses midnight', () => {
    expect(
      eventDays(new Date(2026, 6, 3, 18, 0), new Date(2026, 6, 4, 1, 30))
    ).toEqual(['2026-07-03', '2026-07-04']);
    expect(
      eventDays(new Date(2026, 6, 3, 23, 0), new Date(2026, 6, 4, 9, 40))
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

describe('agoLabel', () => {
  const now = new Date(2026, 8, 1, 12, 0);
  const minutesBefore = (n: number) => new Date(now.getTime() - n * 60_000);

  it('reads the first minute as just now', () => {
    expect(agoLabel(now, now)).toBe('just now');
    expect(agoLabel(minutesBefore(0.9), now)).toBe('just now');
  });

  it('counts minutes, then hours, then days', () => {
    expect(agoLabel(minutesBefore(1), now)).toBe('1m ago');
    expect(agoLabel(minutesBefore(59), now)).toBe('59m ago');
    expect(agoLabel(minutesBefore(60), now)).toBe('1h ago');
    expect(agoLabel(minutesBefore(120), now)).toBe('2h ago');
    expect(agoLabel(minutesBefore(60 * 24), now)).toBe('1d ago');
    expect(agoLabel(minutesBefore(60 * 24 * 3 + 30), now)).toBe('3d ago');
  });

  it('rounds down rather than up', () => {
    expect(agoLabel(minutesBefore(119), now)).toBe('1h ago');
  });
});
