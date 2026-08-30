// Day grouping + headings for the agenda widget. Pure — hardcoded English names
// keep it deterministic across devices (no Intl dependence in the headless
// context).
import { eventDays, parseDay, toDateString } from '@/utils/date';

import type { WidgetEvent } from './types';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** Header date line, e.g. 'Thu ▪ 9 Jul' (local tz). */
export function headerDate(now: Date): string {
  return `${WEEKDAYS[now.getDay()]} ▪ ${now.getDate()} ${MONTHS_SHORT[now.getMonth()]}`;
}

/** Display label for an event link — bare host, e.g. 'meet.google.com'. */
export function linkHost(link: string): string {
  const stripped = link
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .replace(/^www\./i, '');
  return stripped.split(/[/?#]/, 1)[0] || link;
}

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Day-group heading — the near days are just 'Today' / 'Tomorrow' (the date
 * is implied); everything further out spells it out, e.g. 'Mon 13 July'. */
export function dayHeader(d: Date, now: Date): string {
  if (sameLocalDay(d, now)) return 'Today';
  const tomorrow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1
  );
  if (sameLocalDay(d, tomorrow)) return 'Tomorrow';
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** One event's appearance on a single day. `dayIndex`/`spanDays` drive the
 * `(n/N)` multi-day marker; `dayIndex` counts from the event's true start (so a
 * still-running event reads e.g. `(2/3)` on its second day). */
export type WidgetDayItem = {
  event: WidgetEvent;
  dayIndex: number;
  spanDays: number;
};

/**
 * End time to print after the sunset glyph on the final day of a timed
 * multi-day event. Null everywhere else — all-day events and the middle days a
 * timed one fully covers keep the sun, so the sun always means a whole day.
 * `day` guards the case where earlier days were dropped as past and the last
 * one is also the first shown.
 */
export function continuationEnd(item: WidgetDayItem, day: string): Date | null {
  const { event, dayIndex, spanDays } = item;
  if (event.allDay || dayIndex === 1 || dayIndex !== spanDays) return null;
  const end = new Date(event.end);
  return toDateString(end) === day ? end : null;
}

/** True all-day, OR a continuation day of a multi-day event — either way it
 * started before the day did, so it sorts above timed events. */
function isAllDayLike(item: WidgetDayItem): boolean {
  return item.event.allDay || item.dayIndex > 1;
}

/** All-day/continuation first, then chronological — matches the in-app agenda. */
function compareItems(a: WidgetDayItem, b: WidgetDayItem): number {
  const aAll = isAllDayLike(a);
  const bAll = isAllDayLike(b);
  if (aAll !== bAll) return aAll ? -1 : 1;
  return new Date(a.event.start).getTime() - new Date(b.event.start).getTime();
}

export type WidgetDayGroup = {
  /** 'YYYY-MM-DD' local day key. */
  day: string;
  /** Rendered heading for the group, e.g. 'Mon 13 July'. */
  header: string;
  items: WidgetDayItem[];
};

/**
 * Bucket upcoming events by local day, expanding multi-day events onto every day
 * they cover — today onward (past days of a still-running event are dropped, but
 * its `dayIndex` still counts from the true start). Days ascending; within a day,
 * all-day/continuation first, then timed by start.
 */
export function groupByDay(events: WidgetEvent[], now: Date): WidgetDayGroup[] {
  const todayKey = toDateString(now);
  const byDay = new Map<string, WidgetDayItem[]>();
  for (const event of events) {
    const days = eventDays(new Date(event.start), new Date(event.end));
    days.forEach((day, i) => {
      if (day < todayKey) return;
      const item: WidgetDayItem = {
        event,
        dayIndex: i + 1,
        spanDays: days.length,
      };
      const list = byDay.get(day);
      if (list) list.push(item);
      else byDay.set(day, [item]);
    });
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, items]) => ({
      day,
      header: dayHeader(parseDay(day) ?? new Date(day), now),
      items: items.sort(compareItems),
    }));
}
