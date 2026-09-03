// Small local-timezone date helpers for the calendar UI (device-local tz per plan).

/** Local date as a dateString: 'YYYY-MM-DD'. */
export function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 'HH:MM' (24h, local). */
export function toTimeString(d: Date): string {
  return `${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`;
}

/**
 * Last instant (ms) of the final local day an event claims, for day-bucketing.
 * `end` is exclusive at exact midnight (all-day DTEND is non-inclusive; a timed
 * event ending 00:00 shouldn't mark the next day). Never precedes the start.
 */
export function eventLastMs(start: Date, end: Date): number {
  return Math.max(start.getTime(), end.getTime() - 1);
}

/**
 * All local days an event touches, as dateStrings — `eventLastMs` semantics
 * (end exclusive at exact midnight). Capped defensively for degenerate ranges.
 */
export function eventDays(start: Date, end: Date): string[] {
  const lastMs = eventLastMs(start, end);
  const days: string[] = [];
  const cursor = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate()
  );
  while (cursor.getTime() <= lastMs && days.length < 62) {
    days.push(toDateString(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

/** Parse 'YYYY-MM-DD' + 'HH:MM' into a local Date; null when invalid. */
export function parseDayTime(day: string, time: string): Date | null {
  const dayMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.trim());
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!dayMatch || !timeMatch) return null;
  const [, y, m, d] = dayMatch.map(Number);
  const [, hh, mm] = timeMatch.map(Number);
  if (hh > 23 || mm > 59) return null;
  const date = new Date(y, m - 1, d, hh, mm);
  // Reject silent rollover (e.g. 2026-02-31).
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  )
    return null;
  return date;
}

/** Parse 'YYYY-MM-DD' into a local-midnight Date; null when invalid. */
export function parseDay(day: string): Date | null {
  return parseDayTime(day, '00:00');
}

/** Next full hour after `from` (e.g. 14:23 → 15:00). */
export function nextFullHour(from: Date): Date {
  const d = new Date(from);
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

/** Human day heading, e.g. 'Fri, 10 Jul' (editor title, day popover). */
export function dayLabel(day: string): string {
  return (parseDay(day) ?? new Date()).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/** e.g. 'Tue 1 September' — dayLabel with the month spelled out, for the
 *  header, which has the room. Locale-formatted like every other label here,
 *  so the ordering follows the device rather than this file. */
export function longDayLabel(day: string): string {
  return (parseDay(day) ?? new Date()).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  });
}

/** How long ago `from` was, coarsely: 'just now', '5m ago', '2h ago',
 *  '3d ago'. Rounded down — an age is a floor, never a promise — and capped at
 *  days, because past that the exact number stops meaning anything. */
export function agoLabel(from: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - from.getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** dateString shifted by n days (local). */
export function addDays(day: string, n: number): string {
  const d = parseDay(day) ?? new Date();
  d.setDate(d.getDate() + n);
  return toDateString(d);
}
