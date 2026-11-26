// Search on the web: every object of every calendar, hidden ones too, read
// once without a time range and without working out any repeat. Only the
// objects a query matches are expanded, a stretch of time at a time, so
// searching 1900 to 2100 never spells out two centuries of a weekly event.
import type { SearchIndex } from '@/utils/search';

import { calendarColor, calendarIcon, getCalendars, getClient } from './client';
import { expandObjects, isObjectUrl, type FetchedObject } from './objects';
import { searchEntries } from './search-entries';
import type { CalEvent, EventSource } from './types';

export async function loadSearchIndex(): Promise<SearchIndex> {
  const client = await getClient();
  const calendars = await getCalendars();
  const perCalendar = await Promise.all(
    calendars.map(async (calendar) => {
      const objects = await client.fetchCalendarObjects({
        calendar,
        urlFilter: isObjectUrl,
      });
      const source: EventSource = {
        color: calendarColor(calendar),
        icon: calendarIcon(calendar),
      };
      return objects.map((obj) => ({ obj: obj as FetchedObject, source }));
    })
  );
  const objects = new Map(perCalendar.flat().map((o) => [o.obj.url, o]));
  const entries = [...objects.values()].flatMap(({ obj }) =>
    obj.data ? searchEntries(obj.data, obj.url) : []
  );
  // One object's dates over one stretch, kept: typing narrows the matches,
  // and each narrower query needs only what the wider one worked out.
  const expanded = new Map<string, CalEvent[]>();
  return {
    entries,
    async occurrences(keys, start, end) {
      const out: CalEvent[] = [];
      for (const key of keys) {
        const found = objects.get(key);
        if (!found) continue;
        const cacheKey = `${start.getTime()}|${end.getTime()}|${key}`;
        let events = expanded.get(cacheKey);
        if (!events) {
          events = expandObjects([found.obj], start, end, found.source);
          expanded.set(cacheKey, events);
        }
        out.push(...events);
      }
      return out;
    },
  };
}
