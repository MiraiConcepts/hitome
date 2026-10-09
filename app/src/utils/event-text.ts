import type { CalEvent } from '@/caldav/types';
import { formatTime } from '@/utils/date';
import { toWidgetEvent } from '@/widget/select-upcoming';

const date = (d: Date) =>
  d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/** When an event is, in words that stand alone (year included, the clock the
 *  phone is set to). An all-day event's end is the day AFTER its last one. */
export function whenText(event: CalEvent): string {
  const { start, end } = event;
  if (event.allDay) {
    const last = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1);
    return last.getTime() > start.getTime() && !sameDay(start, last)
      ? `${date(start)} to ${date(last)}`
      : `${date(start)}, all day`;
  }
  if (end.getTime() <= start.getTime())
    return `${date(start)}, ${formatTime(start)}`;
  if (sameDay(start, end))
    return `${date(start)}, ${formatTime(start)} to ${formatTime(end)}`;
  return `${date(start)}, ${formatTime(start)} to ${date(end)}, ${formatTime(end)}`;
}

/**
 * What sharing an event sends: its title, when, its place and its links, one
 * to a line. Not its notes (they leave the app only if the person copies them
 * themselves). The place and the meeting link are read as the day list's tags
 * read them, so a location that is really a join link goes as the link.
 */
export function eventShareText(event: CalEvent): string {
  const shown = toWidgetEvent(event);
  const lines = [event.summary.trim() || '(untitled)', whenText(event)];
  if (shown.location) lines.push(shown.location);
  if (shown.meetingLink) lines.push(`Join: ${shown.meetingLink}`);
  if (shown.link) lines.push(shown.link);
  return lines.join('\n');
}
