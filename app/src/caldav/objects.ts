// The calendar objects a month's fetch returns, turned into events. Pure (no
// tsdav client, no expo-crypto), so it is unit-testable offline like ics.ts.
import { expandEvents } from './ics';
import type { CalEvent, EventSource } from './types';

/** One fetched object: its URL, etag and ICS, as tsdav hands them over. */
export type FetchedObject = { url: string; etag?: string; data?: string };

/**
 * Which hrefs of a calendar are its objects: every one but the collection
 * itself. tsdav's own default keeps only names containing ".ics", which
 * silently hid events from clients that name objects some other way (by UID
 * alone, say) on the web while the phone, reading through DAVx5, showed them.
 */
export function isObjectUrl(url: string): boolean {
  return Boolean(url) && !url.endsWith('/');
}

/**
 * Every object's events overlapping [rangeStart, rangeEnd]. An object that
 * cannot be read (a broken DTSTART, none at all, not iCalendar) is left out
 * on its own: one bad object used to fail the whole month, every calendar
 * with it, which looked like being offline.
 */
export function expandObjects(
  objects: FetchedObject[],
  rangeStart: Date,
  rangeEnd: Date,
  source: EventSource = {}
): CalEvent[] {
  const events: CalEvent[] = [];
  for (const obj of objects) {
    if (!obj.data) continue;
    try {
      events.push(
        ...expandEvents(
          obj.data,
          obj.url,
          obj.etag ?? '',
          rangeStart,
          rangeEnd,
          source
        )
      );
    } catch {
      // Unreadable: skipped, the rest of the calendar still shows.
    }
  }
  return events;
}
