import {
  addDays,
  buildMonthRange,
  buildWeekRange,
  gridFetchRange,
  landingIndex,
  isBanner,
  layoutWeek,
  monthIndexIn,
  monthKey,
  monthStartWeekIndex,
  monthStartWeekIndices,
  nearestSnapIndex,
  weekIndexOfDay,
  weekStartOf,
  weeksBetween,
  type GridEventLike,
} from './calendar-grid';
import { parseDay, toDateString } from './date';

// Mon 2026-07-06 .. Sun 2026-07-12 — the reference week for layout tests.
const WEEK = new Date(2026, 6, 6);

/** Week-start dateString -> local midnight, as the grid parses its rows. */
const day = (s: string): Date => parseDay(s) as Date;

const ev = (
  id: string,
  start: Date,
  end: Date,
  allDay = false
): GridEventLike => ({ id, start, end, allDay });

describe('weekStartOf', () => {
  it('maps every day of a week to its Monday', () => {
    for (let i = 0; i < 7; i++) {
      expect(toDateString(weekStartOf(addDays(WEEK, i)))).toBe('2026-07-06');
    }
  });

  it('keeps Sunday in the week that began the day before', () => {
    // Sunday is the last column now, not the first: Sun 2026-07-12 belongs to
    // the week of Mon 2026-07-06, not the one starting the next day.
    expect(toDateString(weekStartOf(new Date(2026, 6, 12)))).toBe('2026-07-06');
  });

  it('crosses month and year boundaries', () => {
    // Fri 2027-01-01 belongs to the week of Mon 2026-12-28.
    expect(toDateString(weekStartOf(new Date(2027, 0, 1)))).toBe('2026-12-28');
  });
});

describe('buildMonthRange', () => {
  const today = new Date(2026, 6, 12);
  const months = buildMonthRange(today);

  it('spans today ± 5 years, one entry per month', () => {
    expect(months.length).toBe(121);
    expect(months[0]).toEqual({ year: 2021, month0: 6 });
    expect(months[months.length - 1]).toEqual({ year: 2031, month0: 6 });
  });

  it('advances one month at a time across year boundaries', () => {
    for (let i = 1; i < months.length; i++) {
      const prev = months[i - 1];
      const step = new Date(prev.year, prev.month0 + 1, 1);
      expect(months[i]).toEqual({
        year: step.getFullYear(),
        month0: step.getMonth(),
      });
    }
  });
});

describe('monthIndexIn', () => {
  const first = { year: 2021, month0: 6 };

  it('counts months from the ribbon start', () => {
    expect(monthIndexIn(first, { year: 2021, month0: 6 })).toBe(0);
    expect(monthIndexIn(first, { year: 2021, month0: 7 })).toBe(1);
    expect(monthIndexIn(first, { year: 2026, month0: 6 })).toBe(60);
  });

  it('is negative before the ribbon start, so callers clamp', () => {
    expect(monthIndexIn(first, { year: 2021, month0: 5 })).toBe(-1);
  });

  it('round-trips through buildMonthRange', () => {
    const months = buildMonthRange(new Date(2026, 6, 12));
    for (const month of [months[0], months[47], months[120]]) {
      expect(months[monthIndexIn(months[0], month)]).toEqual(month);
    }
  });
});

describe('monthKey', () => {
  it('zero-pads the month', () => {
    expect(monthKey({ year: 2026, month0: 0 })).toBe('2026-01');
    expect(monthKey({ year: 2026, month0: 11 })).toBe('2026-12');
  });
});

describe('weeksBetween', () => {
  it('counts whole rows, unaffected by any clock shift in between', () => {
    // Every row of a decade, walked from one end: a ±1h DST step in the raw
    // ms difference must never round to a different row.
    const start = weekStartOf(new Date(2021, 6, 12));
    for (let i = 0; i < 522; i++) {
      expect(weeksBetween(start, weekStartOf(addDays(start, i * 7)))).toBe(i);
    }
  });

  it('goes negative before the start', () => {
    const start = weekStartOf(new Date(2026, 6, 12));
    expect(weeksBetween(start, addDays(start, -14))).toBe(-2);
  });
});

describe('buildWeekRange', () => {
  const months = buildMonthRange(new Date(2026, 6, 12));
  const { rangeStart, weeks } = buildWeekRange(months);

  it('opens on the week containing the first month\u2019s 1st', () => {
    // Jul 1 2021 is a Thursday \u2014 its week starts Mon Jun 28.
    expect(toDateString(rangeStart)).toBe('2021-06-28');
    expect(weeks[0]).toBe('2021-06-28');
  });

  it('steps one week per row throughout', () => {
    for (let i = 1; i < weeks.length; i++) {
      expect(weeks[i]).toBe(toDateString(addDays(day(weeks[i - 1]), 7)));
    }
  });

  it('holds every month in the ribbon, with six rows for the last', () => {
    const rows = monthStartWeekIndices(months, rangeStart);
    expect(rows[0]).toBe(0);
    for (const row of rows) {
      expect(row).toBeGreaterThanOrEqual(0);
      // Five more rows must exist beneath any month a swipe can land on.
      expect(row + 5).toBeLessThan(weeks.length);
    }
  });
});

describe('monthStartWeekIndex', () => {
  const months = buildMonthRange(new Date(2026, 6, 12));
  const { rangeStart, weeks } = buildWeekRange(months);

  it('points at the row holding the 1st', () => {
    // Sep 1 2026 is a Tuesday \u2014 its week starts Mon Aug 31.
    expect(weeks[monthStartWeekIndex(2026, 8, rangeStart)]).toBe('2026-08-31');
    // Mar 1 2026 is a Sunday \u2014 the last column, so its week began Feb 23.
    expect(weeks[monthStartWeekIndex(2026, 2, rangeStart)]).toBe('2026-02-23');
    // Jun 1 2026 is itself a Monday.
    expect(weeks[monthStartWeekIndex(2026, 5, rangeStart)]).toBe('2026-06-01');
  });

  it('agrees with weekIndexOfDay for the 1st', () => {
    for (const m of months) {
      expect(monthStartWeekIndex(m.year, m.month0, rangeStart)).toBe(
        weekIndexOfDay(new Date(m.year, m.month0, 1), rangeStart)
      );
    }
  });
});

describe('monthStartWeekIndices', () => {
  const months = buildMonthRange(new Date(2026, 6, 12));
  const { rangeStart, weeks } = buildWeekRange(months);
  const rows = monthStartWeekIndices(months, rangeStart);

  it('runs index-parallel to the month ribbon', () => {
    expect(rows.length).toBe(months.length);
    for (let i = 0; i < months.length; i++) {
      expect(weeks[rows[i]]).toBe(
        toDateString(weekStartOf(new Date(months[i].year, months[i].month0, 1)))
      );
    }
  });

  it('spaces months 4 or 5 rows apart \u2014 never 6', () => {
    // The whole reason a ribbon beats month pages: a six-row page always
    // overran its neighbour by 6 minus this gap, so it had to redraw a week
    // the next page also drew. Nothing here can overlap.
    const gaps = new Set<number>();
    for (let i = 1; i < rows.length; i++) gaps.add(rows[i] - rows[i - 1]);
    expect([...gaps].sort()).toEqual([4, 5]);
  });
});

describe('monthStartWeekIndices vs. the calendar itself', () => {
  it('marks exactly the rows that contain a 1st', () => {
    // Independent cross-check: a month settles on a row iff some day of that
    // row is a 1st. Catches an off-by-one in the index math that a
    // self-consistent round-trip would not.
    const months = buildMonthRange(new Date(2026, 6, 12));
    const { rangeStart, weeks } = buildWeekRange(months);
    const rows = new Set(monthStartWeekIndices(months, rangeStart));
    const holdsA1st = (weekStart: string) =>
      Array.from({ length: 7 }, (_, i) => addDays(day(weekStart), i)).some(
        (d) => d.getDate() === 1
      );
    // The ribbon runs five rows past the last month, so only compare over the
    // stretch the month ribbon actually covers.
    const last = Math.max(...rows);
    for (let i = 0; i <= last; i++) {
      expect(holdsA1st(weeks[i])).toBe(rows.has(i));
    }
  });
});

describe('nearestSnapIndex', () => {
  const SNAP = [0, 500, 900, 1400, 1800];

  it('finds an exact offset', () => {
    SNAP.forEach((offset, i) => {
      expect(nearestSnapIndex(SNAP, offset)).toBe(i);
    });
  });

  it('picks the closer neighbour between two months', () => {
    expect(nearestSnapIndex(SNAP, 600)).toBe(1);
    expect(nearestSnapIndex(SNAP, 800)).toBe(2);
  });

  it('resolves an exact midpoint to the later month', () => {
    expect(nearestSnapIndex(SNAP, 700)).toBe(2);
  });

  it('clamps beyond either end of the ribbon', () => {
    expect(nearestSnapIndex(SNAP, -9000)).toBe(0);
    expect(nearestSnapIndex(SNAP, 9000)).toBe(SNAP.length - 1);
  });
});

describe('landingIndex', () => {
  const ROW = 100;
  // Rows 0, 5, 9, 14, 18 — real month spacing, alternating 5 and 4 rows.
  const SNAP = [0, 5, 9, 14, 18].map((row) => row * ROW);
  const from = 2;
  const FWD = SNAP[3] - SNAP[2]; // 500 — five rows to the next month
  const BACK = SNAP[2] - SNAP[1]; // 400 — four rows to the previous one
  const at = (moved: number) => SNAP[from] + moved;

  it('stays put below the distance threshold with no speed', () => {
    expect(landingIndex(from, at(FWD * 0.14), SNAP, 0)).toBe(from);
    expect(landingIndex(from, at(-BACK * 0.14), SNAP, 0)).toBe(from);
  });

  it('flips once the drag passes the threshold, in either direction', () => {
    expect(landingIndex(from, at(FWD * 0.15), SNAP, 0)).toBe(from + 1);
    expect(landingIndex(from, at(-BACK * 0.15), SNAP, 0)).toBe(from - 1);
  });

  it('measures the fraction against the real gap, not a fixed height', () => {
    // Months are 4 or 5 rows apart, so the same distance can be enough one
    // way and not the other: 60px clears 15% of the 400px gap back, but not
    // of the 500px gap forward.
    expect(landingIndex(from, at(60), SNAP, 0)).toBe(from);
    expect(landingIndex(from, at(-60), SNAP, 0)).toBe(from - 1);
  });

  it('flips on speed alone, however short the drag', () => {
    expect(landingIndex(from, at(1), SNAP, 0.3)).toBe(from + 1);
    expect(landingIndex(from, at(-1), SNAP, -0.3)).toBe(from - 1);
  });

  it('takes direction from the drag, not the velocity sign', () => {
    // Platforms disagree on the sign of scroll velocity; a fast drag forward
    // must page forward whichever sign arrives with it.
    expect(landingIndex(from, at(2), SNAP, -5)).toBe(from + 1);
    expect(landingIndex(from, at(-2), SNAP, 5)).toBe(from - 1);
  });

  it('never moves more than one month, however far or fast', () => {
    expect(landingIndex(from, at(4000), SNAP, 12)).toBe(from + 1);
    expect(landingIndex(from, at(-4000), SNAP, -12)).toBe(from - 1);
  });

  it('holds the month when nothing moved', () => {
    expect(landingIndex(from, at(0), SNAP, 0)).toBe(from);
    expect(landingIndex(from, at(0), SNAP, 9)).toBe(from);
  });

  it('has nothing to flip to at either end of the ribbon', () => {
    expect(landingIndex(0, SNAP[0] - 900, SNAP, -12)).toBe(0);
    const last = SNAP.length - 1;
    expect(landingIndex(last, SNAP[last] + 900, SNAP, 12)).toBe(last);
  });
});

describe('gridFetchRange', () => {
  it('covers all six grid rows of a short month', () => {
    // Feb 2026's grid starts Mon Jan 26 and runs six rows, through Mar 8.
    const { start, end } = gridFetchRange(2026, 1);
    expect(toDateString(start)).toBe('2026-01-19');
    expect(end.getTime()).toBeGreaterThan(new Date(2026, 2, 9).getTime() - 1);
  });

  it('is one week of slack either side of the month’s first week', () => {
    const { start, end } = gridFetchRange(2026, 6); // first week Mon Jun 29
    expect(toDateString(start)).toBe('2026-06-22');
    expect(toDateString(end)).toBe('2026-08-17');
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
      [ev('a', new Date(2026, 6, 9, 10), new Date(2026, 6, 9, 11))],
      SLOTS
    );
    expect(layout.banners).toEqual([]);
    expect(layout.chips).toMatchObject([{ col: 3, slot: 0, span: 1 }]);
    expect(layout.overflow).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('spans a multi-day timed event across its columns', () => {
    const layout = layoutWeek(
      WEEK,
      [ev('a', new Date(2026, 6, 9, 10), new Date(2026, 6, 11, 11))],
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
      [ev('a', new Date(2026, 6, 5), new Date(2026, 6, 16), true)],
      SLOTS
    );
    expect(layout.banners).toMatchObject([
      { startCol: 0, span: 7, continuesLeft: true, continuesRight: true },
    ]);
  });

  it('treats all-day DTEND as exclusive (single covered day)', () => {
    const layout = layoutWeek(
      WEEK,
      [ev('a', new Date(2026, 6, 9), new Date(2026, 6, 10), true)],
      SLOTS
    );
    expect(layout.banners).toMatchObject([{ startCol: 3, span: 1 }]);
  });

  it('drops events that do not touch the week', () => {
    const layout = layoutWeek(
      WEEK,
      [
        ev('before', new Date(2026, 6, 2, 10), new Date(2026, 6, 2, 11)),
        // Timed event ending exactly at the week's first midnight — exclusive.
        ev('edge', new Date(2026, 6, 5, 22), new Date(2026, 6, 6, 0, 0)),
        ev('after', new Date(2026, 6, 14, 10), new Date(2026, 6, 14, 11)),
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
        ev('a', new Date(2026, 6, 7), new Date(2026, 6, 10), true), // Mon–Wed
        ev('b', new Date(2026, 6, 8), new Date(2026, 6, 11), true), // Tue–Thu
        ev('c', new Date(2026, 6, 10), new Date(2026, 6, 12), true), // Thu–Fri
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
        ev('short', new Date(2026, 6, 7), new Date(2026, 6, 9), true),
        ev('long', new Date(2026, 6, 7), new Date(2026, 6, 12), true),
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
        ev('banner', new Date(2026, 6, 7), new Date(2026, 6, 10), true), // Mon–Wed
        ev('under', new Date(2026, 6, 8, 9), new Date(2026, 6, 8, 10)), // Tue
        ev('clear', new Date(2026, 6, 11, 9), new Date(2026, 6, 11, 10)), // Fri
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
        ev('late', new Date(2026, 6, 9, 15), new Date(2026, 6, 9, 16)),
        ev('early', new Date(2026, 6, 9, 9), new Date(2026, 6, 9, 10)),
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
        ev('a', new Date(2026, 6, 9, 9), new Date(2026, 6, 9, 10)),
        ev('b', new Date(2026, 6, 9, 10), new Date(2026, 6, 9, 11)),
        ev('c', new Date(2026, 6, 9, 11), new Date(2026, 6, 9, 12)),
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
        ev('a', new Date(2026, 6, 9, 9), new Date(2026, 6, 9, 10)),
        ev('b', new Date(2026, 6, 9, 10), new Date(2026, 6, 9, 11)),
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
        ev('A', new Date(2026, 6, 7), new Date(2026, 6, 14), true), // Mon–Sun
        ev('B', new Date(2026, 6, 7), new Date(2026, 6, 9), true), // Mon–Tue
        ev('C', new Date(2026, 6, 7), new Date(2026, 6, 11), true), // Mon–Thu
        ev('chip', new Date(2026, 6, 9, 9), new Date(2026, 6, 9, 10)), // Wed
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
        ev('tall', new Date(2026, 6, 9, 9), new Date(2026, 6, 9, 10)),
        ev('short', new Date(2026, 6, 9, 10), new Date(2026, 6, 9, 11)),
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
        ev('banner', new Date(2026, 6, 9), new Date(2026, 6, 10), true), // Wed
        ev('tall', new Date(2026, 6, 9, 9), new Date(2026, 6, 9, 10)),
        ev('after', new Date(2026, 6, 9, 10), new Date(2026, 6, 9, 11)),
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
      [ev('a', new Date(2026, 6, 9, 9), new Date(2026, 6, 9, 10))],
      3,
      () => 3
    );
    expect(layout.chips).toMatchObject([{ col: 3, slot: 0, span: 3 }]);
    expect(layout.overflow).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('trims a spanning chip to the room left rather than dropping it', () => {
    const layout = layoutWeek(
      WEEK,
      [
        ev('a', new Date(2026, 6, 9, 9), new Date(2026, 6, 9, 10)),
        ev('b', new Date(2026, 6, 9, 10), new Date(2026, 6, 9, 11)),
      ],
      3,
      (e) => (e.id === 'b' ? 3 : 1)
    );
    // b asks for slots 1–3 and only 0–2 are visible, so it takes the two it
    // can have and truncates. Nothing is hidden, so no counter and no blank.
    expect(layout.chips).toMatchObject([
      { event: { id: 'a' }, slot: 0, span: 1 },
      { event: { id: 'b' }, slot: 1, span: 2 },
    ]);
    expect(layout.overflow).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('gives the last slot to the counter once something is truly hidden', () => {
    const layout = layoutWeek(
      WEEK,
      [
        ev('a', new Date(2026, 6, 9, 9), new Date(2026, 6, 9, 10)),
        ev('b', new Date(2026, 6, 9, 10), new Date(2026, 6, 9, 11)),
        ev('c', new Date(2026, 6, 9, 11), new Date(2026, 6, 9, 12)),
      ],
      3,
      (e) => (e.id === 'b' ? 2 : 1)
    );
    // a at 0, b asks for 1–2, c lands at 3 with nowhere to go — so c hides,
    // the counter claims slot 2, and b trims to the single slot left to it.
    expect(layout.chips).toMatchObject([
      { event: { id: 'a' }, slot: 0, span: 1 },
      { event: { id: 'b' }, slot: 1, span: 1 },
    ]);
    expect(layout.overflow).toEqual([0, 0, 0, 1, 0, 0, 0]);
  });

  it('hides a chip with no visible slot at all', () => {
    const layout = layoutWeek(
      WEEK,
      [
        ev('a', new Date(2026, 6, 9, 9), new Date(2026, 6, 9, 10)),
        ev('b', new Date(2026, 6, 9, 10), new Date(2026, 6, 9, 11)),
        ev('c', new Date(2026, 6, 9, 11), new Date(2026, 6, 9, 12)),
      ],
      2
    );
    // Three single-slot chips into two slots: c has no slot to trim into, so
    // it hides and the counter takes slot 1 — which pushes b out too.
    expect(layout.chips).toMatchObject([{ event: { id: 'a' }, slot: 0 }]);
    expect(layout.overflow).toEqual([0, 0, 0, 2, 0, 0, 0]);
  });

  it('hides everything when slotCount is 0', () => {
    const layout = layoutWeek(
      WEEK,
      [
        ev('a', new Date(2026, 6, 9, 9), new Date(2026, 6, 9, 10)),
        ev('b', new Date(2026, 6, 7), new Date(2026, 6, 10), true),
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
        ev('banner', new Date(2026, 6, 9), new Date(2026, 6, 10), true),
        ev('chip', new Date(2026, 6, 9, 10), new Date(2026, 6, 9, 11)),
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
      [ev('a', new Date(2026, 6, 9), new Date(2026, 6, 16), true)],
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
      [ev('tall', new Date(2026, 6, 8), new Date(2026, 6, 10), true)],
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
      [ev('tall', new Date(2026, 6, 8), new Date(2026, 6, 10), true)],
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
