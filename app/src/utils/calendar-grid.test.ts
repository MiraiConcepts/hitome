import {
  addDays,
  buildMonthRange,
  gridFetchRange,
  landingIndex,
  isBanner,
  layoutWeek,
  monthIndexIn,
  monthKey,
  weekStartOf,
  weeksOfMonth,
  type GridEventLike,
} from './calendar-grid';
import { toDateString } from './date';

// Mon 2026-07-06 .. Sun 2026-07-12 — the reference week for layout tests.
const WEEK = new Date(2026, 6, 6);

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

describe('weeksOfMonth', () => {
  it('starts on the Monday of the week containing the 1st', () => {
    // Jul 1 2026 is a Wednesday — its week starts Mon Jun 29.
    expect(weeksOfMonth({ year: 2026, month0: 6 })[0]).toBe('2026-06-29');
    // Jun 1 2026 is itself a Monday.
    expect(weeksOfMonth({ year: 2026, month0: 5 })[0]).toBe('2026-06-01');
    // Mar 1 2026 is a Sunday — the last column, so its week began Feb 23.
    expect(weeksOfMonth({ year: 2026, month0: 2 })[0]).toBe('2026-02-23');
  });

  it('always lists six consecutive Mondays, so every page is one height', () => {
    for (let month0 = 0; month0 < 12; month0++) {
      const weeks = weeksOfMonth({ year: 2026, month0 });
      expect(weeks.length).toBe(6);
      for (let i = 1; i < 6; i++) {
        const prev = new Date(weeks[i - 1]);
        expect(weeks[i]).toBe(toDateString(addDays(prev, 7)));
      }
    }
  });

  it('covers the whole month, worst case included', () => {
    // Mar 2026: 31 days starting Sunday — the six-row worst case now that
    // Sunday is the last column, so the 1st sits alone in row one.
    const weeks = weeksOfMonth({ year: 2026, month0: 2 });
    const last = addDays(new Date(weeks[5]), 6);
    expect(weeks[0] <= '2026-03-01').toBe(true);
    expect(toDateString(last) >= '2026-03-31').toBe(true);
  });
});

describe('landingIndex', () => {
  const H = 800; // page height
  const from = 60;
  const at = (fraction: number) => (from + fraction) * H;

  it('stays put below the distance threshold with no speed', () => {
    expect(landingIndex(from, at(0.14), H, 0)).toBe(from);
    expect(landingIndex(from, at(-0.14), H, 0)).toBe(from);
  });

  it('flips once the drag passes the threshold, in either direction', () => {
    expect(landingIndex(from, at(0.15), H, 0)).toBe(from + 1);
    expect(landingIndex(from, at(-0.15), H, 0)).toBe(from - 1);
  });

  it('flips on speed alone, however short the drag', () => {
    expect(landingIndex(from, at(0.01), H, 0.3)).toBe(from + 1);
    expect(landingIndex(from, at(-0.01), H, -0.3)).toBe(from - 1);
  });

  it('takes direction from the drag, not the velocity sign', () => {
    // Platforms disagree on the sign of scroll velocity; a fast drag forward
    // must page forward whichever sign arrives with it.
    expect(landingIndex(from, at(0.02), H, -5)).toBe(from + 1);
    expect(landingIndex(from, at(-0.02), H, 5)).toBe(from - 1);
  });

  it('never moves more than one month, however far or fast', () => {
    expect(landingIndex(from, at(4), H, 12)).toBe(from + 1);
    expect(landingIndex(from, at(-4), H, -12)).toBe(from - 1);
  });

  it('holds the page when nothing moved', () => {
    expect(landingIndex(from, at(0), H, 0)).toBe(from);
    expect(landingIndex(from, at(0), H, 9)).toBe(from);
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

  it('hides a spanning chip that cannot fully fit and counts it once', () => {
    const layout = layoutWeek(
      WEEK,
      [
        ev('a', new Date(2026, 6, 9, 9), new Date(2026, 6, 9, 10)),
        ev('b', new Date(2026, 6, 9, 10), new Date(2026, 6, 9, 11)),
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
