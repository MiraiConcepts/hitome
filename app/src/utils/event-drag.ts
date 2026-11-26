// The date math behind dragging an event to another day on the web month
// grid (see components/calendar/event-drag): which day a point is over, how
// many days a drop moves by, and the event's new start and end.
import { parseDay, toDateString } from '@/utils/date';

/** Whole days from one dateString to another (negative going back). Counted
 *  on the calendar, not in hours, so a day that changes the clocks still
 *  counts as one. */
export function dayDelta(from: string, to: string): number {
  const a = parseDay(from);
  const b = parseDay(to);
  if (!a || !b) return 0;
  const utc = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((utc(b) - utc(a)) / 86_400_000);
}

/** The same wall-clock time `days` days later (or earlier). */
function shiftDate(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

/**
 * An event moved by `days` whole days: start and end each keep their time
 * of day, so its time and its length stay as they were (a move across a
 * change of the clocks keeps the clock times, as a calendar does).
 */
export function shiftByDays(
  event: { start: Date; end: Date },
  days: number
): { start: Date; end: Date } {
  return {
    start: shiftDate(event.start, days),
    end: shiftDate(event.end, days),
  };
}

/**
 * The day under a point in the month grid, or null off it. The grid is a
 * ribbon of week rows (`weeks`, each its week-start dateString), every row
 * `rowHeight` tall and seven equal days across; `x` and `y` are measured
 * from the visible pane's top-left, `scrollTop` is how far it has scrolled.
 * Worked out from the layout rather than asked of the page, which answers
 * a hit test differently in every browser (see month-grid's showsCell).
 */
export function dayAtPoint(p: {
  x: number;
  y: number;
  width: number;
  height: number;
  scrollTop: number;
  rowHeight: number;
  weeks: readonly string[];
}): { week: string; day: string } | null {
  if (p.x < 0 || p.y < 0 || p.x >= p.width || p.y >= p.height) return null;
  if (p.rowHeight <= 0 || p.width <= 0) return null;
  const row = Math.floor((p.y + p.scrollTop) / p.rowHeight);
  const week = p.weeks[row];
  if (week === undefined) return null;
  const col = Math.min(6, Math.floor((p.x / p.width) * 7));
  const start = parseDay(week);
  if (!start) return null;
  start.setDate(start.getDate() + col);
  return { week, day: toDateString(start) };
}

/**
 * A move shown before the server has it: the dates a drop moves (one date,
 * it and the later ones, or all of them, as the drop's scope says), each by
 * `days`. Dropped once the save and the month's reload have landed, or put
 * back when the save fails.
 */
export type MovePreview = {
  /** Tells two moves of the same event apart. */
  key: number;
  /** The dragged occurrence, and the object it belongs to. */
  id: string;
  url: string;
  /** For "this and following": the dragged occurrence's original start,
   *  unix seconds (CalEvent.recurrenceStart). */
  recurrenceStart?: number;
  scope: 'this' | 'following' | 'all';
  days: number;
};

type Movable = {
  id: string;
  url: string;
  start: Date;
  end: Date;
  recurrenceStart?: number;
};

function moves(event: Movable, move: MovePreview): boolean {
  // One date of a series by which date it is, not by its id: the id names
  // where it starts, which the move itself changes (an Undo looks for it
  // where it now is).
  if (move.scope === 'this')
    return move.recurrenceStart === undefined
      ? event.id === move.id
      : event.url === move.url &&
          event.recurrenceStart === move.recurrenceStart;
  if (event.url !== move.url) return false;
  if (move.scope === 'all') return true;
  const at = event.recurrenceStart ?? Math.floor(event.start.getTime() / 1000);
  return at >= (move.recurrenceStart ?? 0);
}

/** The events with every move still being saved applied, in order. The
 *  same array when there are none. */
export function applyMoves<T extends Movable>(
  events: T[],
  previews: readonly MovePreview[]
): T[] {
  if (previews.length === 0) return events;
  return events.map((event) => {
    let days = 0;
    for (const move of previews) if (moves(event, move)) days += move.days;
    return days === 0 ? event : { ...event, ...shiftByDays(event, days) };
  });
}
