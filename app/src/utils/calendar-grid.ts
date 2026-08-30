// Pure math for the paged month grid: the bounded month ribbon (the list
// data, one entry per page), the six week rows a page draws, and per-week
// banner/chip lane layout. No React or react-native imports — runs under bun
// test and CI jest.
import { eventLastMs, toDateString } from '@/utils/date';

const DAY_MS = 86_400_000;

/** Grid range: today ± this many years of week rows. */
const RANGE_YEARS = 5;

/** Calendar-safe day arithmetic (setDate-style); also normalizes to local midnight. */
export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Local-midnight Monday of the week containing `d` (weeks start Monday).
 *  getDay() counts from Sunday, so it is rotated before subtracting. */
export function weekStartOf(d: Date): Date {
  return addDays(d, -((d.getDay() + 6) % 7));
}

/** A calendar month reference (month0 is 0-based like Date#getMonth). */
export type MonthAnchor = { year: number; month0: number };

/** Months are addressed by their absolute ordinal, so index math is exact. */
const ordinalOf = ({ year, month0 }: MonthAnchor) => year * 12 + month0;

/**
 * The bounded month ribbon: every month from RANGE_YEARS before `today`
 * through RANGE_YEARS after. One entry per page of the grid — the list data.
 */
export function buildMonthRange(today: Date): MonthAnchor[] {
  const first = ordinalOf({
    year: today.getFullYear() - RANGE_YEARS,
    month0: today.getMonth(),
  });
  const count = RANGE_YEARS * 2 * 12 + 1;
  return Array.from({ length: count }, (_, i) => ({
    year: Math.floor((first + i) / 12),
    month0: (first + i) % 12,
  }));
}

/** Page index of `anchor` in a ribbon starting at `first`; out of range when
 *  negative or past the ribbon's end, so callers clamp. */
export function monthIndexIn(first: MonthAnchor, anchor: MonthAnchor): number {
  return ordinalOf(anchor) - ordinalOf(first);
}

/** Stable page key, e.g. '2026-08'. */
export function monthKey({ year, month0 }: MonthAnchor): string {
  return `${year}-${String(month0 + 1).padStart(2, '0')}`;
}

/**
 * The six week-starts a month page renders: the week containing the 1st, plus
 * five. Six always covers a month (a 31-day month starting Sunday is the worst
 * case, at exactly six), and always rendering six — rather than the four or
 * five a month may strictly need — is what keeps every page the same height,
 * which is what makes one swipe equal one month.
 */
export function weeksOfMonth({ year, month0 }: MonthAnchor): string[] {
  const first = weekStartOf(new Date(year, month0, 1));
  return Array.from({ length: 6 }, (_, i) =>
    toDateString(addDays(first, i * 7))
  );
}

// What it takes to flip a month. The platform's own rule is "drag past half
// the page, or fling hard enough that its predicted landing crosses the
// halfway mark" — on a full-screen page that is a very long drag, which is
// what made paging feel like work. These replace it: a drag flips once it has
// covered this fraction of a page, or is let go with this much speed behind
// it (dp/ms, the unit Android and iOS both report). Neither can move more
// than one month, because the decision is always "the page the drag started
// on, plus or minus one".
const FLIP_FRACTION = 0.15;
const FLIP_VELOCITY = 0.3;

/**
 * Where a gesture lands: the page it began on, plus or minus one. Both
 * platforms run this same rule, so a drag that flips the month on the phone
 * flips it in the browser too. Direction comes from the distance moved rather
 * than the velocity's sign, which differs between platforms.
 */
export function landingIndex(
  from: number,
  offset: number,
  height: number,
  velocity: number
): number {
  const moved = offset - from * height;
  const direction = Math.sign(moved);
  if (direction === 0) return from;
  const flips =
    Math.abs(moved) >= height * FLIP_FRACTION ||
    Math.abs(velocity) >= FLIP_VELOCITY;
  return flips ? from + direction : from;
}

/**
 * Fetch window covering a settled month's full 6-row viewport:
 * [weekStart(1st) − 7d, weekStart(1st) + 49d). Unlike the old
 * [1st−7d, last+7d) window, this covers the 6th grid row even for short
 * short months (e.g. a February whose grid runs two weeks into March, where
 * last+7d would stop a week early).
 */
export function gridFetchRange(
  year: number,
  month0: number
): { start: Date; end: Date } {
  const firstWeek = weekStartOf(new Date(year, month0, 1));
  return { start: addDays(firstWeek, -7), end: addDays(firstWeek, 49) };
}

/** The minimal event shape the layout needs (CalEvent satisfies it). */
export type GridEventLike = {
  id: string;
  start: Date;
  end: Date;
  allDay: boolean;
};

export type BannerPlacement<T extends GridEventLike = GridEventLike> = {
  event: T;
  /** 0..6 within this week. */
  startCol: number;
  /** 1..7 columns covered in this week. */
  span: number;
  /** Vertical slot; 0 sits directly under the day-number line. */
  slot: number;
  /** Consecutive vertical slots occupied (>1 when the title wraps). */
  rows: number;
  /** Event started before this week — render a squared-off left edge. */
  continuesLeft: boolean;
  continuesRight: boolean;
};

export type ChipPlacement<T extends GridEventLike = GridEventLike> = {
  event: T;
  col: number;
  slot: number;
  /** Consecutive vertical slots occupied (>1 when the title wraps). */
  span: number;
};

export type WeekLayout<T extends GridEventLike = GridEventLike> = {
  banners: BannerPlacement<T>[];
  chips: ChipPlacement<T>[];
  /** Hidden-event count per weekday column; >0 renders "+N more" in the last slot. */
  overflow: number[];
};

/**
 * All-day events and anything touching more than one local day render as
 * spanning banners. Day coverage comes from eventLastMs (end exclusive at
 * exact midnight, matching eventDays) but NOT via eventDays(), whose 62-day
 * cap would truncate very long events.
 */
export function isBanner(event: GridEventLike): boolean {
  if (event.allDay) return true;
  const lastMs = eventLastMs(event.start, event.end);
  return toDateString(event.start) !== toDateString(new Date(lastMs));
}

/** Day-column offset of `d`'s local midnight from weekStart (DST-safe). */
function dayDiff(weekStart: Date, d: Date): number {
  const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((midnight.getTime() - weekStart.getTime()) / DAY_MS);
}

/**
 * Lay out one week row. Banners pack greedily into the lowest free slot run
 * (sorted startCol asc → span desc → start asc → id, so packing is
 * deterministic); chips then fill per-column gaps under partial banners. Each
 * banner occupies `bannerRows(event, spanCols)` and each chip
 * `chipSpan(event)` consecutive slots (default 1 — wrapped titles ask for
 * more). With `slotCount` visible slots, an
 * overflowing column hides everything touching slot (slotCount − 1) or below
 * it and reports the hidden count — a chip that cannot fully fit hides
 * entirely; a banner hidden in any covered column hides row-wide, which can
 * cascade "+N more" into columns that previously fit — the hide pass iterates
 * to a fixpoint. Hidden occupants are not re-packed (an occasional empty slot
 * beats layout jumps). slotCount ≤ 0 hides everything; callers only render
 * "+N more" when slotCount ≥ 1.
 */
export function layoutWeek<T extends GridEventLike>(
  weekStart: Date,
  events: T[],
  slotCount: number,
  chipSpan?: (event: T) => number,
  bannerRows?: (event: T, spanCols: number) => number
): WeekLayout<T> {
  const weekStartMs = weekStart.getTime();
  const weekEndMs = addDays(weekStart, 7).getTime();

  const banners: BannerPlacement<T>[] = [];
  const chipsByCol: T[][] = [[], [], [], [], [], [], []];
  for (const event of events) {
    const lastMs = eventLastMs(event.start, event.end);
    if (event.start.getTime() >= weekEndMs || lastMs < weekStartMs) continue;
    if (isBanner(event)) {
      const startDay = dayDiff(weekStart, event.start);
      const endDay = dayDiff(weekStart, new Date(lastMs));
      const startCol = Math.max(0, startDay);
      const endCol = Math.min(6, endDay);
      const span = endCol - startCol + 1;
      banners.push({
        event,
        startCol,
        span,
        slot: 0,
        rows: Math.max(1, bannerRows ? bannerRows(event, span) : 1),
        continuesLeft: startDay < 0,
        continuesRight: endDay > 6,
      });
    } else {
      const col = dayDiff(weekStart, event.start);
      if (col >= 0 && col <= 6) chipsByCol[col].push(event);
    }
  }

  banners.sort(
    (a, b) =>
      a.startCol - b.startCol ||
      b.span - a.span ||
      a.event.start.getTime() - b.event.start.getTime() ||
      a.event.id.localeCompare(b.event.id)
  );

  // occupied[slot][col]; slots grow unbounded — visibility is applied after.
  const occupied: boolean[][] = [];
  const slotFree = (slot: number, from: number, to: number): boolean => {
    if (slot >= occupied.length) return true;
    for (let c = from; c <= to; c++) {
      if (occupied[slot][c]) return false;
    }
    return true;
  };
  // Lowest slot where `rows` consecutive slots are all free across [from..to].
  const freeSlotRun = (from: number, to: number, rows: number): number => {
    for (let slot = 0; ; slot++) {
      let free = true;
      for (let s = slot; s < slot + rows; s++) {
        if (!slotFree(s, from, to)) {
          free = false;
          break;
        }
      }
      if (free) return slot;
    }
  };
  const claim = (slot: number, from: number, to: number) => {
    while (occupied.length <= slot) occupied.push(new Array(7).fill(false));
    for (let c = from; c <= to; c++) occupied[slot][c] = true;
  };

  for (const banner of banners) {
    const endCol = banner.startCol + banner.span - 1;
    banner.slot = freeSlotRun(banner.startCol, endCol, banner.rows);
    for (let s = banner.slot; s < banner.slot + banner.rows; s++) {
      claim(s, banner.startCol, endCol);
    }
  }

  // Lowest slot where `span` consecutive slots are all free in `col`.
  const freeRun = (col: number, span: number): number => {
    for (let slot = 0; ; slot++) {
      let free = true;
      for (let s = slot; s < slot + span; s++) {
        if (s < occupied.length && occupied[s][col]) {
          free = false;
          break;
        }
      }
      if (free) return slot;
    }
  };

  const chips: ChipPlacement<T>[] = [];
  chipsByCol.forEach((list, col) => {
    list.sort(
      (a, b) =>
        a.start.getTime() - b.start.getTime() || a.id.localeCompare(b.id)
    );
    for (const event of list) {
      const span = Math.max(1, chipSpan ? chipSpan(event) : 1);
      const slot = freeRun(col, span);
      for (let s = slot; s < slot + span; s++) claim(s, col, col);
      chips.push({ event, col, slot, span });
    }
  });

  const coversCol = (b: BannerPlacement<T>, col: number) =>
    col >= b.startCol && col < b.startCol + b.span;
  const hiddenBanners = new Set<BannerPlacement<T>>();
  const hiddenChips = new Set<ChipPlacement<T>>();

  let changed = true;
  while (changed) {
    changed = false;
    for (let col = 0; col < 7; col++) {
      const colBanners = banners.filter((b) => coversCol(b, col));
      const colChips = chips.filter((chip) => chip.col === col);
      const anyHidden =
        colBanners.some((b) => hiddenBanners.has(b)) ||
        colChips.some((chip) => hiddenChips.has(chip));
      // An occupant's bottom slot is (slot + rows/span − 1); it doesn't fit
      // when that reaches slotCount, and collides with "+N more" at
      // slotCount − 1.
      const needsMore =
        anyHidden ||
        colBanners.some(
          (b) => !hiddenBanners.has(b) && b.slot + b.rows > slotCount
        ) ||
        colChips.some(
          (chip) => !hiddenChips.has(chip) && chip.slot + chip.span > slotCount
        );
      if (!needsMore) continue;
      for (const b of colBanners) {
        if (!hiddenBanners.has(b) && b.slot + b.rows > slotCount - 1) {
          hiddenBanners.add(b);
          changed = true;
        }
      }
      for (const chip of colChips) {
        if (!hiddenChips.has(chip) && chip.slot + chip.span > slotCount - 1) {
          hiddenChips.add(chip);
          changed = true;
        }
      }
    }
  }

  const overflow = Array.from(
    { length: 7 },
    (_, col) =>
      banners.filter((b) => hiddenBanners.has(b) && coversCol(b, col)).length +
      chips.filter((chip) => hiddenChips.has(chip) && chip.col === col).length
  );

  return {
    banners: banners.filter((b) => !hiddenBanners.has(b)),
    chips: chips.filter((chip) => !hiddenChips.has(chip)),
    overflow,
  };
}
