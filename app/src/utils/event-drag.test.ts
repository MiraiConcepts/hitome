import {
  applyMoves,
  dayAtPoint,
  dayDelta,
  shiftByDays,
} from '@/utils/event-drag';

describe('dayDelta', () => {
  it('counts whole days either way', () => {
    expect(dayDelta('2026-11-04', '2026-11-06')).toBe(2);
    expect(dayDelta('2026-11-06', '2026-11-04')).toBe(-2);
    expect(dayDelta('2026-11-06', '2026-11-06')).toBe(0);
  });

  it('crosses months and years', () => {
    expect(dayDelta('2026-10-30', '2026-11-02')).toBe(3);
    expect(dayDelta('2026-12-31', '2027-01-01')).toBe(1);
  });

  it('counts a day the clocks change as one', () => {
    // Europe and the US both change the clocks around these dates.
    expect(dayDelta('2026-10-24', '2026-10-26')).toBe(2);
    expect(dayDelta('2026-03-28', '2026-03-30')).toBe(2);
  });

  it('is zero for a malformed day', () => {
    expect(dayDelta('nope', '2026-11-06')).toBe(0);
  });
});

describe('shiftByDays', () => {
  it('keeps the time of day and the length', () => {
    const start = new Date(2026, 10, 4, 9, 30);
    const end = new Date(2026, 10, 4, 10, 45);
    const moved = shiftByDays({ start, end }, 3);
    expect(moved.start).toEqual(new Date(2026, 10, 7, 9, 30));
    expect(moved.end).toEqual(new Date(2026, 10, 7, 10, 45));
  });

  it('moves back', () => {
    const moved = shiftByDays(
      { start: new Date(2026, 10, 2, 23, 0), end: new Date(2026, 10, 3, 1, 0) },
      -5
    );
    expect(moved.start).toEqual(new Date(2026, 9, 28, 23, 0));
    expect(moved.end).toEqual(new Date(2026, 9, 29, 1, 0));
  });

  it('moves an all-day event by its midnights', () => {
    const moved = shiftByDays(
      { start: new Date(2026, 10, 30), end: new Date(2026, 11, 2) },
      2
    );
    expect(moved.start).toEqual(new Date(2026, 11, 2));
    expect(moved.end).toEqual(new Date(2026, 11, 4));
  });

  it('keeps the clock time across a change of the clocks', () => {
    const moved = shiftByDays(
      {
        start: new Date(2026, 9, 24, 9, 0),
        end: new Date(2026, 9, 24, 10, 0),
      },
      7
    );
    expect(moved.start.getHours()).toBe(9);
    expect(moved.end.getHours()).toBe(10);
    expect(moved.start.getDate()).toBe(31);
  });

  it('leaves the original alone', () => {
    const start = new Date(2026, 10, 4, 9, 0);
    shiftByDays({ start, end: start }, 1);
    expect(start).toEqual(new Date(2026, 10, 4, 9, 0));
  });
});

describe('dayAtPoint', () => {
  // Mondays, three rows of 100px, seven 100px days across.
  const grid = {
    width: 700,
    height: 300,
    rowHeight: 100,
    scrollTop: 0,
    weeks: ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23'],
  };

  it('names the day under the point', () => {
    expect(dayAtPoint({ ...grid, x: 10, y: 10 })).toEqual({
      week: '2026-11-02',
      day: '2026-11-02',
    });
    expect(dayAtPoint({ ...grid, x: 650, y: 150 })).toEqual({
      week: '2026-11-09',
      day: '2026-11-15',
    });
  });

  it('counts the scroll', () => {
    expect(dayAtPoint({ ...grid, scrollTop: 100, x: 250, y: 50 })).toEqual({
      week: '2026-11-09',
      day: '2026-11-11',
    });
  });

  it('runs into the next month', () => {
    expect(dayAtPoint({ ...grid, x: 450, y: 250 })?.day).toBe('2026-11-20');
    expect(
      dayAtPoint({
        ...grid,
        weeks: ['2026-11-30'],
        x: 350,
        y: 50,
      })?.day
    ).toBe('2026-12-03');
  });

  it('is null off the pane or past the last row', () => {
    expect(dayAtPoint({ ...grid, x: -1, y: 10 })).toBeNull();
    expect(dayAtPoint({ ...grid, x: 10, y: 300 })).toBeNull();
    expect(dayAtPoint({ ...grid, x: 700, y: 10 })).toBeNull();
    expect(dayAtPoint({ ...grid, scrollTop: 150, x: 10, y: 260 })).toBeNull();
  });
});

describe('applyMoves', () => {
  const at = (day: number, rs?: number) => ({
    id: `s:${day}`,
    url: '/cal/series.ics',
    start: new Date(2026, 10, day, 9),
    end: new Date(2026, 10, day, 10),
    ...(rs === undefined ? {} : { recurrenceStart: rs }),
  });
  const weekly = [at(2, 2), at(9, 9), at(16, 16)];
  const other = { ...at(3), id: 'o', url: '/cal/other.ics' };
  const days = (events: { start: Date }[]) =>
    events.map((e) => e.start.getDate());
  const move = (scope: 'this' | 'following' | 'all', id = 's:9') => ({
    key: 1,
    id,
    url: '/cal/series.ics',
    recurrenceStart: 9,
    scope,
    days: 2,
  });

  it('gives back the same array with nothing to apply', () => {
    expect(applyMoves(weekly, [])).toBe(weekly);
  });

  it('moves one date, it and the later ones, or all of them', () => {
    expect(days(applyMoves([...weekly, other], [move('this')]))).toEqual([
      2, 11, 16, 3,
    ]);
    expect(days(applyMoves([...weekly, other], [move('following')]))).toEqual([
      2, 11, 18, 3,
    ]);
    expect(days(applyMoves([...weekly, other], [move('all')]))).toEqual([
      4, 11, 18, 3,
    ]);
  });

  it('keeps the time and length, and adds up two moves', () => {
    const [moved] = applyMoves(
      [other],
      [
        { ...move('all', 'o'), url: '/cal/other.ics' },
        { ...move('all', 'o'), key: 2, url: '/cal/other.ics', days: -1 },
      ]
    );
    expect(moved.start).toEqual(new Date(2026, 10, 4, 9));
    expect(moved.end).toEqual(new Date(2026, 10, 4, 10));
  });
});
