// Recurrence expansion: one calendar object's ICS into the events and
// occurrences that fall in a range. Ported from ical-expander (MIT, 3.2.0) onto
// the app's own ical.js: the package brought a second, older ical.js along,
// and both copies shipped. Its timezone table is still read from the package.
import ICAL from 'ical.js';
import zones from 'ical-expander/zones-compiled.json';

type Occurrence = ReturnType<ICAL.Event['getOccurrenceDetails']>;

export type Expansion = { events: ICAL.Event[]; occurrences: Occurrence[] };

// Zones for events that name a TZID without carrying its VTIMEZONE, as
// ical-expander registered them on load.
for (const [tzid, body] of Object.entries(zones as Record<string, string>)) {
  const parsed = ICAL.parse(
    `BEGIN:VCALENDAR\nPRODID:-//tzurl.org//NONSGML Olson 2012h//EN\nVERSION:2.0\nBEGIN:VTIMEZONE\r\nTZID:${tzid}\r\n${body}\r\nEND:VTIMEZONE\nEND:VCALENDAR`
  );
  const vtimezone = new ICAL.Component(parsed).getFirstSubcomponent(
    'vtimezone'
  );
  if (vtimezone)
    ICAL.TimezoneService.register(new ICAL.Timezone(vtimezone), tzid);
}

/** Start and end in ms; an all-day end (next midnight) pulled back by 1. */
function times(item: { startDate: ICAL.Time; endDate: ICAL.Time }) {
  const start = item.startDate.toJSDate().getTime();
  let end = item.endDate.toJSDate().getTime();
  if (item.endDate.isDate && end > start) end -= 1;
  return { start, end };
}

/**
 * The events and occurrences of `ics` overlapping [after, before]: a
 * moved or edited occurrence (a RECURRENCE-ID exception) stands in for the
 * one it replaces, and EXDATEs are left out. At most `maxIterations`
 * occurrences are walked per repeating event.
 */
export function expandBetween(
  ics: string,
  after: Date,
  before: Date,
  maxIterations = 1000
): Expansion {
  const component = new ICAL.Component(ICAL.parse(ics));
  const all = component
    .getAllSubcomponents('vevent')
    .map((vevent) => new ICAL.Event(vevent));
  const exceptions = all.filter((e) => e.isRecurrenceException());
  const inRange = (start: number, end: number) =>
    end >= after.getTime() && start <= before.getTime();

  const result: Expansion = { events: [], occurrences: [] };
  for (const event of all) {
    if (event.isRecurrenceException()) continue;
    if (!event.isRecurring()) {
      const { start, end } = times(event);
      if (inRange(start, end)) result.events.push(event);
      continue;
    }
    const exdates = event.component
      .getAllProperties('exdate')
      .map((p) => (p.getFirstValue() as ICAL.Time).toJSDate().getTime());
    const iterator = event.iterator();
    for (let i = 0; i < maxIterations; i++) {
      const next = iterator.next();
      if (!next) break;
      const occurrence = event.getOccurrenceDetails(next);
      const { start, end } = times(occurrence);
      if (start > before.getTime()) break;
      if (!inRange(start, end)) continue;
      const exception = exceptions.find(
        (ex) =>
          ex.uid === event.uid &&
          ex.recurrenceId?.toJSDate().getTime() ===
            occurrence.startDate.toJSDate().getTime()
      );
      if (exception) result.events.push(exception);
      else if (!exdates.includes(start)) result.occurrences.push(occurrence);
    }
  }
  return result;
}
