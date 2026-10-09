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

/** One step of each frequency whose steps are whole units of wall-clock
 *  time, in seconds; the larger ones repeat on a fixed pattern of them. */
const STEP: Record<string, number> = {
  SECONDLY: 1,
  MINUTELY: 60,
  HOURLY: 3_600,
  DAILY: 86_400,
  WEEKLY: 604_800,
};

/**
 * Where to start walking a series so it reaches `from` in a few steps: its
 * DTSTART moved on by whole periods of the rule (INTERVAL x FREQ), which the
 * rule repeats from just as it does from DTSTART, so every occurrence from
 * there on is the same. The start is kept far enough back that anything the
 * walk loses before it, or the start itself (always given first, matching
 * or not), ends before `from`. Undefined when the series must be walked from
 * its DTSTART: a COUNT (counted from there), RDATEs, more than one rule, or
 * a monthly or yearly rule (months and years are not one length).
 */
function startNear(event: ICAL.Event, from: number): ICAL.Time | undefined {
  const rules = event.component.getAllProperties('rrule');
  if (rules.length !== 1 || event.component.hasProperty('rdate')) return;
  const rule = rules[0].getFirstValue() as ICAL.Recur;
  const step = STEP[rule.freq];
  const dtstart = event.startDate;
  if (!step || rule.count || (dtstart.isDate && step < STEP.DAILY)) return;
  if (rule.until && rule.until.toJSDate().getTime() < from) return;
  const period = step * (rule.interval || 1) * 1000;
  // An occurrence is at most this long: the event's own length, plus the
  // hour a change of clocks can add to one that has any length at all.
  const own = event.endDate.toJSDate().getTime() - dtstart.toJSDate().getTime();
  const length = own > 0 ? own + 3_600_000 : 0;
  // Periods counted in ms are only near the wall-clock ones the rule steps
  // in (the zone's offset changes over the years), so the guess is checked
  // and moved back until it is clear of `from`.
  let periods = Math.floor(
    (from - length - dtstart.toJSDate().getTime()) / period
  );
  while (periods > 0) {
    const start = dtstart.clone();
    const seconds = (periods * period) / 1000;
    if (step >= STEP.DAILY) start.adjust(seconds / 86_400, 0, 0, 0);
    else start.adjust(0, 0, 0, seconds);
    const over = start.toJSDate().getTime() + length - from;
    if (over < 0) return start;
    periods -= Math.ceil((over + 1) / period);
  }
  return undefined;
}

/**
 * The events and occurrences of `ics` overlapping [after, before]: a
 * moved or edited occurrence (a RECURRENCE-ID exception) stands in for the
 * one it replaces, wherever it was moved to, and EXDATEs are left out. Each
 * repeating event gives at most `maxOccurrences` in the range, and its rule
 * is walked at most `maxSteps` times: a series that cannot start near the
 * range (see startNear) is walked from its DTSTART, which once cut off a
 * daily series after under three years when the walk itself was capped at
 * 1000.
 */
export function expandBetween(
  ics: string,
  after: Date,
  before: Date,
  maxOccurrences = 1000,
  maxSteps = 10_000
): Expansion {
  const component = new ICAL.Component(ICAL.parse(ics));
  const all = component
    .getAllSubcomponents('vevent')
    .map((vevent) => new ICAL.Event(vevent));
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
    // This series' exceptions, by the occurrence each replaces; only those
    // that now sit in the range are shown, and the walk reaches as far as
    // their occurrences (an occurrence moved out of the range, or into it
    // from outside, is shown where it is now).
    const replaced = new Set<number>();
    const moved = new Map<number, ICAL.Event>();
    let from = after.getTime();
    let until = before.getTime();
    for (const ex of all) {
      if (!ex.isRecurrenceException() || ex.uid !== event.uid) continue;
      const at = ex.recurrenceId.toJSDate().getTime();
      replaced.add(at);
      const { start, end } = times(ex);
      if (!inRange(start, end)) continue;
      moved.set(at, ex);
      from = Math.min(from, at);
      until = Math.max(until, at);
    }
    // Every value of every EXDATE (one may list several, comma-separated).
    const exdates = event.component
      .getAllProperties('exdate')
      .flatMap((p) => p.getValues() as ICAL.Time[])
      .map((t) => t.toJSDate().getTime());
    const iterator = event.iterator(startNear(event, from));
    let shown = 0;
    for (let i = 0; i < maxSteps && shown < maxOccurrences; i++) {
      const next = iterator.next();
      if (!next) break;
      // The rule's own date decides when to stop, not where an exception
      // moved it: one moved later must not end the walk early.
      const at = next.toJSDate().getTime();
      if (at > until) break;
      if (moved.has(at)) {
        result.events.push(moved.get(at)!);
        moved.delete(at);
        shown++;
        continue;
      }
      // Replaced by an exception that now sits outside the range.
      if (replaced.has(at)) continue;
      const occurrence = event.getOccurrenceDetails(next);
      const { start, end } = times(occurrence);
      if (!inRange(start, end) || exdates.includes(at)) continue;
      result.occurrences.push(occurrence);
      shown++;
    }
  }
  return result;
}
