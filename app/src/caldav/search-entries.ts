// What search reads of one calendar object: each VEVENT's words and the
// stretch of time it can have dates in, without working out any repeat.
// Pure (no tsdav), so it is unit-testable offline like ics.ts.
import ICAL from 'ical.js';

import { FIRST_YEAR } from '@/utils/calendar-grid';
import { type SearchEntry, yearStart } from '@/utils/search';

import './expand'; // registers the zones a TZID may name without a VTIMEZONE

function text(vevent: ICAL.Component, name: string): string | undefined {
  const value = vevent.getFirstPropertyValue(name);
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/**
 * One entry per VEVENT of the object, all under its URL: a moved or
 * renamed occurrence is an entry of its own, with its own words and dates.
 * A series runs from its DTSTART to its UNTIL, or without end (a COUNT is
 * not walked here; RDATEs may sit anywhere). An object that cannot be read
 * gives nothing.
 */
export function searchEntries(ics: string, key: string): SearchEntry[] {
  try {
    const root = new ICAL.Component(ICAL.parse(ics));
    return root.getAllSubcomponents('vevent').flatMap((vevent) => {
      const event = new ICAL.Event(vevent);
      if (!event.startDate) return [];
      const first = event.startDate.toJSDate().getTime();
      const end = event.endDate?.toJSDate().getTime() ?? first;
      let last: number | null = Math.max(first, end);
      let from = first;
      if (vevent.hasProperty('rrule') || vevent.hasProperty('rdate')) {
        const rules = vevent.getAllProperties('rrule');
        const until =
          rules.length === 1 && !vevent.hasProperty('rdate')
            ? (rules[0].getFirstValue() as ICAL.Recur).until
            : null;
        last = until ? until.toJSDate().getTime() + (end - first) : null;
        if (vevent.hasProperty('rdate')) from = yearStart(FIRST_YEAR).getTime();
      }
      return [
        {
          key,
          summary: text(vevent, 'summary'),
          location: text(vevent, 'location'),
          description: text(vevent, 'description'),
          first: from,
          last,
        },
      ];
    });
  } catch {
    return [];
  }
}
