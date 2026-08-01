import {
  addDays,
  buildWeekRange,
  gridFetchRange,
  isBanner,
  layoutWeek,
  monthAnchorOf,
  monthStartWeekIndex,
  weekIndexOfDay,
  weekStartOf,
  weeksBetween,
  type GridEventLike,
} from './calendar-grid';
import { toDateString } from './date';

// Sun 2026-07-05 .. Sat 2026-07-11 — the reference week for layout tests.
const WEEK = new Date(2026, 6, 5);

const ev = (
  id: string,
  start: Date,
  end: Date,
  allDay = false
): GridEventLike => ({ id, start, end, allDay });

describe('weekStartOf', () => {
  it('maps every day of a week to its Sunday', () => {
    for (let i = 0; i < 7; i++) {
      expect(toDateString(weekStartOf(addDays(WEEK, i)))).toBe('2026-07-05');
    }
  });

  it('crosses month and year boundaries', () => {
    // Fri 2027-01-01 belongs to the week of Sun 2026-12-27.
    expect(toDateString(weekStartOf(new Date(2027, 0, 1)))).toBe('2026-12-27');
  });
});

describe('weeksBetween / weekIndexOfDay', () => {
  it('counts whole weeks between week starts', () => {
    expect(weeksBetween(WEEK, WEEK)).toBe(0);
    expect(weeksBetween(WEEK, addDays(WEEK, 7))).toBe(1);
    expect(weeksBetween(WEEK, addDays(WEEK, 70))).toBe(10);
    expect(weeksBetween(addDays(WEEK, 7), WEEK)).toBe(-1);
  });

  it('increments once per 7 days across a year boundary (DST-safe)', () => {
    const rangeStart = new Date(2026, 9, 4); // Sun 2026-10-04
    for (let i = 0; i < 26; i++) {
      expect(weekIndexOfDay(addDays(rangeStart, i * 7 + 3), rangeStart)).toBe(
        i
      );
    }
  });
});

describe('buildWeekRange', () => {
  const today = new Date(2026, 6, 12);
  const { rangeStart, weeks } = buildWeekRange(today);

  it('starts on a Sunday and spans ~10 years of weeks', () => {
    expect(rangeStart.getDay()).toBe(0);
    expect(weeks[0]).toBe(toDateString(rangeStart));
    expect(weeks.length).toBeGreaterThan(500);
    expect(weeks.length).toBeLessThan(550);
  });

  it('lists consecutive Sundays and contains today’s week', () => {
    expect(weeks[1]).toBe(toDateString(addDays(rangeStart, 7)));
    const todayIndex = weekIndexOfDay(today, rangeStart);
    expect(weeks[todayIndex]).toBe(toDateString(weekStartOf(today)));
  });
});

describe('monthStartWeekIndex', () => {
  const rangeStart = new Date(2026, 0, 4); // Sun 2026-01-04

  it('targets the week containing the 1st', () => {
    // Jul 1 2026 is a Wednesday — its week starts Sun Jun 28.
    const index = monthStartWeekIndex(2026, 6, rangeStart);
    expect(toDateString(addDays(rangeStart, index * 7))).toBe('2026-06-28');
  });

  it('is negative for a month starting before the range', () => {
    // Jan 2026's 1st falls before rangeStart.
    expect(monthStartWeekIndex(2026, 0, rangeStart)).toBeLessThan(0);
  });
});

describe('monthAnchorOf', () => {
  it('assigns the week containing the 1st to that month, for any weekday 1st', () => {
    // Months starting Mon..Sun: Feb 2027 (Mon), Sep 2026 (Tue), Jul 2026 (Wed),
    // Oct 2026 (Thu), May 2026 (Fri), Aug 2026 (Sat), Mar 2026 (Sun).
    const cases: [number, number][] = [
      [2027, 1],
      [2026, 8],
      [2026, 6],
      [2026, 9],
      [2026, 4],
      [2026, 7],
      [2026, 2],
    ];
    for (const [year, month0] of cases) {
      const anchor = monthAnchorOf(weekStartOf(new Date(year, month0, 1)));
      expect([anchor.year, anchor.month0]).toEqual([year, month0]);
    }
  });

  it('keeps the preceding week in the previous month', () => {
    const firstWeek = weekStartOf(new Date(2026, 6, 1));
    const anchor = monthAnchorOf(addDays(firstWeek, -7));
    expect([anchor.year, anchor.month0]).toEqual([2026, 5]);
  });
});

describe('gridFetchRange', () => {
  it('covers all six grid rows of a Sunday-starting short month', () => {
    // Feb 2026 starts Sun — the settled grid shows through Sat Mar 14.
    const { start, end } = gridFetchRange(2026, 1);
    expect(toDateString(start)).toBe('2026-01-25');
    expect(end.getTime()).toBeGreaterThan(new Date(2026, 2, 15).getTime() - 1);
  });

  it('is one week of slack either side of the month’s first week', () => {
    const { start, end } = gridFetchRange(2026, 6); // first week Sun Jun 28
    expect(toDateString(start)).toBe('2026-06-21');
    expect(toDateString(end)).toBe('2026-08-16');
  });
});

describe('isBanner', () => {
  it('is true for all-day events', () => {
    expect(
      isBanner(ev('a', new Date(2026, 6, 8), new Date(2026, 6, 9), true))
    ).toBe(true);
  });

  it('is false for a same-day timed event', () => {
    expect(
      isBanner(ev('a', new Date(2026, 6, 8, 10), new Date(2026, 6, 8, 11)))
    ).toBe(false);
  });

  it('treats an exact-midnight end as same-day (end-exclusive)', () => {
    expect(
      isBanner(ev('a', new Date(2026, 6, 8, 22), new Date(2026, 6, 9, 0, 0)))
    ).toBe(false);
  });

  it('is true for a timed event crossing midnight', () => {
    expect(
      isBanner(ev('a', new Date(2026, 6, 8, 23), new Date(2026, 6, 9, 1)))
    ).toBe(true);
  });
});

describe('layoutWeek', () => {
  const SLOTS = 10; // roomy default so packing tests aren’t clipped

  it('places a timed event as a chip in its column', () => {
    const layout = layoutWeek(
      WEEK,
      [ev('a', new Date(2026, 6, 8, 10), new Date(2026, 6, 8, 11))],
      SLOTS
    );
    expect(layout.banners).toEqual([]);
    expect(layout.chips).toMatchObject([{ col: 3, slot: 0, span: 1 }]);
    expect(layout.overflow).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('spans a multi-day timed event across its columns', () => {
    const layout = layoutWeek(
      WEEK,
      [ev('a', new Date(2026, 6, 8, 10), new Date(2026, 6, 10, 11))],
      SLOTS
    );
    expect(layout.banners).toMatchObject([
      {
        startCol: 3,
        span: 3,
        slot: 0,
        continuesLeft: false,
        continuesRight: false,
      },
    ]);
  });

  it('clamps banners at week edges and flags continuation', () => {
    const layout = layoutWeek(
      WEEK,
      [ev('a', new Date(2026, 6, 4), new Date(2026, 6, 15), true)],
      SLOTS
    );
    expect(layout.banners).toMatchObject([
      { startCol: 0, span: 7, continuesLeft: true, continuesRight: true },
    ]);
  });

  it('treats all-day DTEND as exclusive (single covered day)', () => {
    const layout = layoutWeek(
      WEEK,
      [ev('a', new Date(2026, 6, 8), new Date(2026, 6, 9), true)],
      SLOTS
    );
    expect(layout.banners).toMatchObject([{ startCol: 3, span: 1 }]);
  });

  it('drops events that do not touch the week', () => {
    const layout = layoutWeek(
      WEEK,
      [
        ev('before', new Date(2026, 6, 1, 10), new Date(2026, 6, 1, 11)),
        // Timed event ending exactly at the week's first midnight — exclusive.
        ev('edge', new Date(2026, 6, 4, 22), new Date(2026, 6, 5, 0, 0)),
        ev('after', new Date(2026, 6, 13, 10), new Date(2026, 6, 13, 11)),
      ],
      SLOTS
    );
    expect(layout.banners).toEqual([]);
    expect(layout.chips).toEqual([]);
  });

  it('packs overlapping banners into lanes and reuses freed columns', () => {
    const layout = layoutWeek(
      WEEK,
      [
        ev('a', new Date(2026, 6, 6), new Date(2026, 6, 9), true), // Mon–Wed
        ev('b', new Date(2026, 6, 7), new Date(2026, 6, 10), true), // Tue–Thu
        ev('c', new Date(2026, 6, 9), new Date(2026, 6, 11), true), // Thu–Fri
      ],
      SLOTS
    );
    const bySlot = Object.fromEntries(
      layout.banners.map((b) => [b.event.id, b.slot])
    );
    expect(bySlot).toEqual({ a: 0, b: 1, c: 0 }); // c fits beside a
  });

  it('orders same-start banners longer-first, deterministically', () => {
    const layout = layoutWeek(
      WEEK,
      [
        ev('short', new Date(2026, 6, 6), new Date(2026, 6, 8), true),
        ev('long', new Date(2026, 6, 6), new Date(2026, 6, 11), true),
      ],
      SLOTS
    );
    const bySlot = Object.fromEntries(
      layout.banners.map((b) => [b.event.id, b.slot])
    );
    expect(bySlot).toEqual({ long: 0, short: 1 });
  });

  it('fills chip gaps under partial banners', () => {
    const layout = layoutWeek(
      WEEK,
      [
        ev('banner', new Date(2026, 6, 6), new Date(2026, 6, 9), true), // Mon–Wed
        ev('under', new Date(2026, 6, 7, 9), new Date(2026, 6, 7, 10)), // Tue
        ev('clear', new Date(2026, 6, 10, 9), new Date(2026, 6, 10, 10)), // Fri
      ],
      SLOTS
    );
    const chip = (id: string) => layout.chips.find((c) => c.event.id === id)!;
    expect(chip('under').slot).toBe(1);
    expect(chip('clear').slot).toBe(0);
  });

  it('sorts chips within a column by start time', () => {
    const layout = layoutWeek(
      WEEK,
      [
        ev('late', new Date(2026, 6, 8, 15), new Date(2026, 6, 8, 16)),
        ev('early', new Date(2026, 6, 8, 9), new Date(2026, 6, 8, 10)),
      ],
      SLOTS
    );
    const bySlot = Object.fromEntries(
      layout.chips.map((c) => [c.event.id, c.slot])
    );
    expect(bySlot).toEqual({ early: 0, late: 1 });
  });

  it('hides from slotCount−1 up in overflowing columns and counts them', () => {
    const layout = layoutWeek(
      WEEK,
      [
        ev('a', new Date(2026, 6, 8, 9), new Date(2026, 6, 8, 10)),
        ev('b', new Date(2026, 6, 8, 10), new Date(2026, 6, 8, 11)),
        ev('c', new Date(2026, 6, 8, 11), new Date(2026, 6, 8, 12)),
      ],
      2
    );
    expect(layout.chips).toMatchObject([{ event: { id: 'a' }, slot: 0 }]);
    expect(layout.overflow).toEqual([0, 0, 0, 2, 0, 0, 0]);
  });

  it('keeps full columns visible when they exactly fit', () => {
    const layout = layoutWeek(
      WEEK,
      [
        ev('a', new Date(2026, 6, 8, 9), new Date(2026, 6, 8, 10)),
        ev('b', new Date(2026, 6, 8, 10), new Date(2026, 6, 8, 11)),
      ],
      2
    );
    expect(layout.chips).toHaveLength(2);
    expect(layout.overflow).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('hides clipped banners row-wide and cascades into covered columns', () => {
    // Packing (span desc): A slot 0, C slot 1, B slot 2; chip under C on Wed
    // packs to slot 2. slotCount 2: Mon overflows (B at slot 2) and hides
    // everything from slot 1 up; C's row-wide hide then drags Wed's chip out
    // even though Wed itself never exceeded the visible slots.
    const layout = layoutWeek(
      WEEK,
      [
        ev('A', new Date(2026, 6, 6), new Date(2026, 6, 13), true), // Mon–Sun
        ev('B', new Date(2026, 6, 6), new Date(2026, 6, 8), true), // Mon–Tue
        ev('C', new Date(2026, 6, 6), new Date(2026, 6, 10), true), // Mon–Thu
        ev('chip', new Date(2026, 6, 8, 9), new Date(2026, 6, 8, 10)), // Wed
      ],
      2
    );
    expect(layout.banners.map((b) => b.event.id)).toEqual(['A']);
    expect(layout.chips).toEqual([]);
    expect(layout.overflow).toEqual([0, 2, 2, 2, 1, 0, 0]);
  });

  it('claims consecutive slots for spanning chips and packs after them', () => {
    const layout = layoutWeek(
      WEEK,
      [
        ev('tall', new Date(2026, 6, 8, 9), new Date(2026, 6, 8, 10)),
        ev('short', new Date(2026, 6, 8, 10), new Date(2026, 6, 8, 11)),
      ],
      SLOTS,
      (e) => (e.id === 'tall' ? 3 : 1)
    );
    const byId = Object.fromEntries(
      layout.chips.map((c) => [c.event.id, [c.slot, c.span]])
    );
    expect(byId).toEqual({ tall: [0, 3], short: [3, 1] });
  });

  it('starts a spanning chip below banners in its column', () => {
    const layout = layoutWeek(
      WEEK,
      [
        ev('banner', new Date(2026, 6, 8), new Date(2026, 6, 9), true), // Wed
        ev('tall', new Date(2026, 6, 8, 9), new Date(2026, 6, 8, 10)),
        ev('after', new Date(2026, 6, 8, 10), new Date(2026, 6, 8, 11)),
      ],
      SLOTS,
      (e) => (e.id === 'tall' ? 2 : 1)
    );
    const byId = Object.fromEntries(
      layout.chips.map((c) => [c.event.id, [c.slot, c.span]])
    );
    expect(byId).toEqual({ tall: [1, 2], after: [3, 1] });
  });

  it('keeps a spanning chip that exactly fills the visible slots', () => {
    const layout = layoutWeek(
      WEEK,
      [ev('a', new Date(2026, 6, 8, 9), new Date(2026, 6, 8, 10))],
      3,
      () => 3
    );
    expect(layout.chips).toMatchObject([{ col: 3, slot: 0, span: 3 }]);
    expect(layout.overflow).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('hides a spanning chip that cannot fully fit and counts it once', () => {
    const layout = layoutWeek(
      WEEK,
      [
        ev('a', new Date(2026, 6, 8, 9), new Date(2026, 6, 8, 10)),
        ev('b', new Date(2026, 6, 8, 10), new Date(2026, 6, 8, 11)),
      ],
      3,
      (e) => (e.id === 'b' ? 3 : 1)
    );
    // b needs slots 1–3 but only 0–2 are visible → it hides whole; a stays.
    expect(layout.chips).toMatchObject([{ event: { id: 'a' }, slot: 0 }]);
    expect(layout.overflow).toEqual([0, 0, 0, 1, 0, 0, 0]);
  });

  it('hides everything when slotCount is 0', () => {
    const layout = layoutWeek(
      WEEK,
      [
        ev('a', new Date(2026, 6, 8, 9), new Date(2026, 6, 8, 10)),
        ev('b', new Date(2026, 6, 6), new Date(2026, 6, 9), true),
      ],
      0
    );
    expect(layout.banners).toEqual([]);
    expect(layout.chips).toEqual([]);
    expect(layout.overflow).toEqual([0, 1, 1, 2, 0, 0, 0]);
  });

  it('grants a banner extra rows and stacks chips below the run', () => {
    const layout = layoutWeek(
      WEEK,
      [
        ev('banner', new Date(2026, 6, 8), new Date(2026, 6, 9), true),
        ev('chip', new Date(2026, 6, 8, 10), new Date(2026, 6, 8, 11)),
      ],
      10,
      undefined,
      () => 2
    );
    expect(layout.banners).toMatchObject([
      { event: { id: 'banner' }, startCol: 3, span: 1, slot: 0, rows: 2 },
    ]);
    expect(layout.chips).toMatchObject([{ event: { id: 'chip' }, slot: 2 }]);
  });

  it('passes the clipped in-week column span to bannerRows', () => {
    const seen: number[] = [];
    layoutWeek(
      WEEK,
      // Wed Jul 8 → Tue Jul 14, clipped to Wed..Sat (4 columns) this week.
      [ev('a', new Date(2026, 6, 8), new Date(2026, 6, 15), true)],
      10,
      undefined,
      (_event, spanCols) => {
        seen.push(spanCols);
        return 1;
      }
    );
    expect(seen).toEqual([4]);
  });

  it('keeps a wrapped banner whose full run fits the visible slots', () => {
    const layout = layoutWeek(
      WEEK,
      [ev('tall', new Date(2026, 6, 7), new Date(2026, 6, 9), true)],
      2,
      undefined,
      () => 2
    );
    expect(layout.banners).toMatchObject([{ slot: 0, rows: 2 }]);
    expect(layout.overflow).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('hides a wrapped banner that cannot fully fit and counts it per column', () => {
    const layout = layoutWeek(
      WEEK,
      [ev('tall', new Date(2026, 6, 7), new Date(2026, 6, 9), true)],
      1,
      undefined,
      () => 2
    );
    // Two rows into one visible slot → hides whole, counted once in each
    // covered column.
    expect(layout.banners).toEqual([]);
    expect(layout.overflow).toEqual([0, 0, 1, 1, 0, 0, 0]);
  });
});
