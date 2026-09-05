// Pure selection logic for the agenda widget — no tsdav/expo imports.
import type { CalEvent } from '@/caldav/types';

import { findMeetingLink, normalizeLink } from './meeting-link';
import type { WidgetEvent } from './types';

/** How many events the widget shows. */
export const UPCOMING_LIMIT = 20;

/**
 * The next `limit` events at `now`: anything still in progress or starting
 * later, ordered by start. `end > now` is the correct liveness test for both
 * kinds — CalEvent's all-day `end` is already the exclusive midnight boundary.
 */
export function selectUpcoming(
  events: CalEvent[],
  now: Date,
  limit: number = UPCOMING_LIMIT
): CalEvent[] {
  return events
    .filter((e) => e.end.getTime() > now.getTime())
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .slice(0, limit);
}

/**
 * Locations arrive multi-line (Apple Calendar writes `venue\naddress`), but the
 * widget renders them on a single maxLines={1} row — Android ellipsizes at the
 * first line break regardless of available width, so join the lines instead.
 */
function singleLineLocation(location: string): string {
  return location.replace(/\s*\n+\s*/g, ', ').trim();
}

/** CalEvent → JSON-safe widget snapshot. */
export function toWidgetEvent(e: CalEvent): WidgetEvent {
  // A URL property that IS the meeting link renders only as the Join chip;
  // any other URL property keeps its own plain link line.
  const meetingLink = findMeetingLink(e);
  const plainLink = e.link ? normalizeLink(e.link) : undefined;
  return {
    id: e.id,
    summary: e.summary,
    start: e.start.toISOString(),
    end: e.end.toISOString(),
    allDay: e.allDay,
    ...(e.location ? { location: singleLineLocation(e.location) } : {}),
    ...(meetingLink ? { meetingLink } : {}),
    ...(plainLink && plainLink !== meetingLink ? { link: plainLink } : {}),
    ...(e.recurring ? { recurring: true } : {}),
    ...(e.alarm ? { alarm: true } : {}),
    ...(e.color ? { color: e.color } : {}),
    ...(e.icon ? { icon: e.icon } : {}),
  };
}
