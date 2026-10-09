// Pure iCalendar (RFC 5545) logic — NO tsdav / expo-crypto imports, so this module
// is unit-testable offline (the property-preservation test is the plan's #1 risk).
import ICAL from 'ical.js';
import { tzlib_get_ical_block } from 'timezones-ical-library';

import { expandBetween } from './expand';
import { applyRecurrence, masterVevent } from './rrule';
import type { CalEvent, EventChanges, EventInput, EventSource } from './types';
import { applyAlarm } from './valarm';

/**
 * Expand one calendar object's ICS into concrete CalEvents overlapping [start, end).
 * Handles single and recurring events uniformly (expand.ts). `source` carries
 * the calendar's rendering hints (color + marker icon) as plain data, so this module
 * stays tsdav-free.
 */
export function expandEvents(
  ics: string,
  url: string,
  etag: string,
  rangeStart: Date,
  rangeEnd: Date,
  source: EventSource = {}
): CalEvent[] {
  const { events, occurrences } = expandBetween(ics, rangeStart, rangeEnd);

  const map = (
    event: any,
    startTime: any,
    endTime: any,
    recurrenceId?: any
  ): CalEvent => {
    const vevent = event.component; // the VEVENT ICAL.Component
    const uid: string = event.uid;
    const link = vevent.getFirstPropertyValue('url');
    const conference =
      vevent.getFirstPropertyValue('conference') ??
      vevent.getFirstPropertyValue('x-google-conference');
    return {
      id: `${uid}:${startTime.toString()}`,
      url,
      etag,
      uid,
      summary: event.summary ?? '',
      start: startTime.toJSDate(),
      end: endTime.toJSDate(),
      allDay: Boolean(startTime.isDate),
      location: vevent.getFirstPropertyValue('location') ?? undefined,
      description: vevent.getFirstPropertyValue('description') ?? undefined,
      ...(link ? { link: String(link) } : {}),
      ...(conference ? { conference: String(conference) } : {}),
      ...(vevent.hasProperty('rrule') || vevent.hasProperty('recurrence-id')
        ? {
            recurring: true,
            // Which occurrence this is, independent of where it now sits —
            // the key scoped edits and deletes address it by.
            recurrenceStart: (recurrenceId ?? startTime).toUnixTime(),
          }
        : {}),
      ...(vevent.getFirstSubcomponent('valarm') ? { alarm: true } : {}),
      ...(source.color ? { color: source.color } : {}),
      ...(source.icon ? { icon: source.icon } : {}),
      raw: ics,
    };
  };

  return [
    ...events.map((e: any) =>
      map(e, e.startDate, e.endDate, e.recurrenceId ?? undefined)
    ),
    ...occurrences.map((o: any) =>
      map(o.item, o.startDate, o.endDate, o.recurrenceId)
    ),
  ];
}

/** All-day ICAL.Time (VALUE=DATE) from a local Date. */
function toAllDayTime(d: Date) {
  return new ICAL.Time(
    {
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      day: d.getDate(),
      isDate: true,
    },
    ICAL.Timezone.localTimezone
  );
}

/** Now, in UTC — what DTSTAMP and LAST-MODIFIED must be (RFC 5545 3.8.7);
 *  ICAL.Time.now() is floating local time, written without the Z. */
const utcNow = () => ICAL.Time.fromJSDate(new Date(), true);

/** The zone new times are written in: the phone's, handed over at launch by
 *  utils/region (the headless tasks get it too); the runtime's otherwise. */
let writeZone: string | undefined;
export function setWriteZone(zone: string | undefined): void {
  writeZone = zone || undefined;
}
function deviceZone(): string | undefined {
  try {
    return writeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return writeZone;
  }
}

/**
 * The zone a timed write uses, and its VTIMEZONE in the calendar (added when
 * missing). An event that already has a zone keeps it — like Google
 * Calendar, an event stays pinned to the zone it was made in, so a 9:00
 * Tokyo meeting is still 9:00 Tokyo after an edit from Singapore. Anything
 * else (new, or written as UTC before zones existed) takes the phone's.
 * Undefined means UTC: a zone with no definition to embed.
 */
function writeTimezone(
  vcalendar: ICAL.Component,
  vevent?: ICAL.Component
): ICAL.Timezone | undefined {
  const own = vevent?.getFirstProperty('dtstart')?.getParameter('tzid');
  if (typeof own === 'string') {
    const embedded = vcalendar
      .getAllSubcomponents('vtimezone')
      .find((tz) => tz.getFirstPropertyValue('tzid') === own);
    if (embedded) return new ICAL.Timezone(embedded);
  }
  const name = typeof own === 'string' ? own : deviceZone();
  if (!name || name === 'UTC' || name === 'Etc/UTC') return undefined;
  let block: string | undefined;
  try {
    const found = tzlib_get_ical_block(name) as unknown;
    block = Array.isArray(found) ? found[0] : undefined;
  } catch {
    block = undefined;
  }
  if (!block || !block.startsWith('BEGIN:VTIMEZONE')) return undefined;
  const component = new ICAL.Component(ICAL.parse(block));
  if (
    !vcalendar
      .getAllSubcomponents('vtimezone')
      .some((tz) => tz.getFirstPropertyValue('tzid') === name)
  )
    vcalendar.addSubcomponent(component);
  return new ICAL.Timezone(component);
}

/**
 * An instant as wall-clock time in a zone. The platform's zone rules when it
 * knows the TZID (every IANA name); otherwise the zone's own VTIMEZONE, as
 * for Outlook's "W. Europe Standard Time", which Intl rejects. UTC when
 * neither can place it.
 */
function zonedTime(d: Date, zone: ICAL.Timezone): ICAL.Time {
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone: zone.tzid,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
  } catch {
    try {
      return ICAL.Time.fromJSDate(d, true).convertToZone(zone);
    } catch {
      return ICAL.Time.fromJSDate(d, true);
    }
  }
  const parts = Object.fromEntries(
    format.formatToParts(d).map((p) => [p.type, Number(p.value)])
  );
  return ICAL.Time.fromData(
    {
      year: parts.year,
      month: parts.month,
      day: parts.day,
      hour: parts.hour,
      minute: parts.minute,
      second: parts.second,
    },
    zone
  );
}

/** Where a series keeps its time of day: a zone, UTC (a zone with no
 *  definition), or the device's own days (all-day dates). */
type Clock = ICAL.Timezone | 'utc' | 'local';

/**
 * An instant's wall-clock time on `clock`, as ms with the fields read as
 * UTC. The difference of two is whole days plus a change of time of day,
 * whatever the clocks did in between: moving a series "a week on" across
 * the change to summer time is 7 days, not 7 days less an hour, which put an
 * all-day series on the day before and a timed one an hour early.
 */
function wallTime(d: Date, clock: Clock): number {
  if (clock === 'utc') return d.getTime();
  if (clock === 'local')
    return Date.UTC(
      d.getFullYear(),
      d.getMonth(),
      d.getDate(),
      d.getHours(),
      d.getMinutes(),
      d.getSeconds()
    );
  const t = zonedTime(d, clock);
  return Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second);
}

/** The instant at a wall-clock time (as wallTime gives it) on `clock`. */
function fromWallTime(ms: number, clock: Clock): Date {
  if (clock === 'utc') return new Date(ms);
  const w = new Date(ms);
  if (clock === 'local')
    return new Date(
      w.getUTCFullYear(),
      w.getUTCMonth(),
      w.getUTCDate(),
      w.getUTCHours(),
      w.getUTCMinutes(),
      w.getUTCSeconds()
    );
  try {
    return ICAL.Time.fromData(
      {
        year: w.getUTCFullYear(),
        month: w.getUTCMonth() + 1,
        day: w.getUTCDate(),
        hour: w.getUTCHours(),
        minute: w.getUTCMinutes(),
        second: w.getUTCSeconds(),
      },
      clock
    ).toJSDate();
  } catch {
    return new Date(ms);
  }
}

/**
 * DTSTART/DTEND pair for an event. Timed events are written in a zone (see
 * writeTimezone) so a repeating 9:00 stays 9:00 across daylight saving —
 * UTC, the first cut, drifted an hour twice a year; UTC remains the fallback
 * for a zone with no definition. All-day events get a VALUE=DATE pair with
 * the non-inclusive DTEND (+1 day).
 */
function toTimePair(
  start: Date,
  end: Date,
  allDay: boolean,
  zone?: ICAL.Timezone
) {
  if (!allDay) {
    if (zone)
      return { start: zonedTime(start, zone), end: zonedTime(end, zone) };
    return {
      start: ICAL.Time.fromJSDate(start, true), // useUTC
      end: ICAL.Time.fromJSDate(end, true),
    };
  }
  const endTime = toAllDayTime(end);
  endTime.day += 1; // DTEND is non-inclusive
  return { start: toAllDayTime(start), end: endTime };
}

/**
 * Build a new VCALENDAR string for a create. `uid` is passed in (generated by the
 * caller via expo-crypto) so this stays crypto-free and testable.
 */
export function buildEventICS(input: EventInput, uid: string): string {
  const vcalendar = new ICAL.Component(['vcalendar', [], []]);
  vcalendar.updatePropertyWithValue('prodid', '-//hitome//caldav//EN');
  vcalendar.updatePropertyWithValue('version', '2.0');

  const vevent = new ICAL.Component('vevent');
  const event = new ICAL.Event(vevent);
  event.uid = uid;
  event.summary = input.summary;

  // ICAL.Event setters manage the TZID parameter / VALUE=DATE type correctly.
  const { start, end } = toTimePair(
    input.start,
    input.end,
    input.allDay,
    input.allDay ? undefined : writeTimezone(vcalendar)
  );
  event.startDate = start;
  event.endDate = end;

  if (input.location)
    vevent.updatePropertyWithValue('location', input.location);
  if (input.description)
    vevent.updatePropertyWithValue('description', input.description);
  // After the DTSTART write — the weekdays rotation and UNTIL type read it.
  if (input.recurrence) applyRecurrence(vevent, input.recurrence);
  if (input.alarm) applyAlarm(vevent, input.alarm);
  vevent.updatePropertyWithValue('dtstamp', utcNow());

  vcalendar.addSubcomponent(vevent);
  return vcalendar.toString();
}

/** Which occurrences of a repeating event an edit or delete applies to. */
export type EditScope = 'this' | 'following' | 'all';

/** Writes the field changes (not the repeat rule) onto one VEVENT. */
function applyFieldChanges(
  vcalendar: ICAL.Component,
  vevent: ICAL.Component,
  changes: EventChanges,
  times?: { start: Date; end: Date; allDay: boolean }
): void {
  const event = new ICAL.Event(vevent);
  if (changes.summary !== undefined) event.summary = changes.summary;
  if (changes.location !== undefined) event.location = changes.location;
  if (changes.description !== undefined)
    event.description = changes.description;
  if (times) {
    // Event setters replace the TZID parameter / value type instead of leaving a
    // stale `;TZID=` next to a rewritten value (updatePropertyWithValue would).
    const { start, end } = toTimePair(
      times.start,
      times.end,
      times.allDay,
      times.allDay ? undefined : writeTimezone(vcalendar, vevent)
    );
    event.startDate = start;
    event.endDate = end;
  }
  if (changes.alarm !== undefined) applyAlarm(vevent, changes.alarm);
}

/** Bump revision metadata only — never X-APPLE-*, ATTENDEE, ORGANIZER. */
function touch(vevent: ICAL.Component): void {
  vevent.updatePropertyWithValue('last-modified', utcNow());
  const seq = Number(vevent.getFirstPropertyValue('sequence') ?? 0);
  vevent.updatePropertyWithValue('sequence', seq + 1);
}

/**
 * Edit an existing event while PRESERVING unknown properties (X-APPLE-*, ATTENDEE,
 * ORGANIZER, …). Parse the original tree and mutate ONLY the provided fields — never
 * rebuild a VEVENT from scratch (that is what drops data). Plan's #1 correctness risk.
 *
 * Whole-series semantics: edits the series master (never an override that
 * happens to come first in the file). A time change is a SHIFT: `from` is the
 * start the edit was made against (the occurrence on screen), and the master
 * moves by the same amount — so moving one Tuesday's 10:00 to 11:00 moves
 * every Tuesday, rather than restarting the series on that Tuesday (which
 * silently deleted every occurrence before it). Without `from`, the master's
 * own start is the base, which is the same thing for a one-off event.
 */
export function editPreserving(
  ics: string,
  changes: EventChanges,
  from?: Date
): string {
  const vcalendar = new ICAL.Component(ICAL.parse(ics));
  const vevent = masterVevent(vcalendar);
  if (!vevent) return ics;

  const before = new ICAL.Event(vevent).startDate.clone();
  let times: { start: Date; end: Date; allDay: boolean } | undefined;
  let clock: Clock = 'utc';
  if (changes.start && changes.end) {
    const allDay = changes.allDay ?? false;
    // The shift and the length are wall-clock time where the series will be
    // written (see wallTime), so they survive a change of clocks.
    clock = allDay ? 'local' : (writeTimezone(vcalendar, vevent) ?? 'utc');
    const masterStart = before.toJSDate();
    const base = from ?? masterStart;
    if (base.getTime() === masterStart.getTime()) {
      // Edited against the master's own start: the new times as they are.
      times = { start: changes.start, end: changes.end, allDay };
    } else {
      const shift = wallTime(changes.start, clock) - wallTime(base, clock);
      const start = wallTime(masterStart, clock) + shift;
      const length =
        wallTime(changes.end, clock) - wallTime(changes.start, clock);
      times = {
        start: fromWallTime(start, clock),
        end: fromWallTime(start + length, clock),
        allDay,
      };
    }
  }
  applyFieldChanges(vcalendar, vevent, changes, times);
  if (times) shiftExceptions(vcalendar, vevent, before, clock);
  // After any DTSTART change — the weekdays rotation reads the new value.
  // The editor only emits these for rules/alarms it owns ('custom'/'foreign'
  // prefills never produce a change), so foreign data is never rewritten.
  if (changes.recurrence !== undefined)
    applyRecurrence(vevent, changes.recurrence);
  touch(vevent);
  return vcalendar.toString();
}

/**
 * After the whole series moves, its exclusions and overrides move with it.
 * They name occurrences by their old start; left as they were, a deleted
 * occurrence would come back and a moved one would lose its changes, since
 * neither would match an occurrence any more. When the series is toggled
 * between all-day and timed, the exclusions and RECURRENCE-IDs take its new
 * value type (RFC 5545 requires DTSTART's), naming the same occurrences; an
 * override's own times are left as they are, keeping what it was changed to.
 */
function shiftExceptions(
  vcalendar: ICAL.Component,
  master: ICAL.Component,
  before: ICAL.Time,
  clock: Clock
): void {
  const after = new ICAL.Event(master).startDate;
  const retyped = after.isDate !== before.isDate;
  // On the series' own clock (see wallTime), so each keeps its time of day
  // and its weekday on either side of a change of clocks.
  const shift =
    wallTime(after.toJSDate(), clock) - wallTime(before.toJSDate(), clock);
  if (shift === 0 && !retyped) return;
  const shifted = (value: ICAL.Time): ICAL.Time => {
    // Already of the new type (a DATE exclusion on a timed series, say): it
    // names that day as it is.
    if (retyped && value.isDate === after.isDate) return value;
    if (value.isDate && !retyped) {
      const day = value.clone();
      day.day += Math.round(shift / 86_400_000);
      return day;
    }
    const at = fromWallTime(wallTime(value.toJSDate(), clock) + shift, clock);
    return after.isDate && retyped
      ? toAllDayTime(at)
      : ICAL.Time.fromJSDate(at, true);
  };
  const moved = (prop: ICAL.Property) => {
    // Every value: one EXDATE may list several, comma-separated.
    const old = prop.getValues() as ICAL.Time[];
    const values = old.map(shifted);
    if (values.every((value, i) => value === old[i])) return;
    if (values.length > 1) prop.setValues(values);
    else prop.setValue(values[0]);
    // Rewritten in UTC, like the master's own new start (a DATE has none).
    prop.removeParameter('tzid');
  };
  for (const ex of master.getAllProperties('exdate')) moved(ex);
  for (const v of vcalendar.getAllSubcomponents('vevent')) {
    const rid = v.getFirstProperty('recurrence-id');
    if (!rid) continue;
    moved(rid);
    if (retyped) continue;
    // The override's own times follow too, so one renamed (or moved by an
    // hour) keeps the same place relative to the series it belongs to.
    for (const name of ['dtstart', 'dtend']) {
      const prop = v.getFirstProperty(name);
      if (prop) moved(prop);
    }
  }
}

/** The override VEVENT for one occurrence, if the object has one. */
function overrideFor(
  vcalendar: ICAL.Component,
  recurrenceStart: number
): ICAL.Component | undefined {
  return vcalendar
    .getAllSubcomponents('vevent')
    .find(
      (v) =>
        v.hasProperty('recurrence-id') &&
        (v.getFirstPropertyValue('recurrence-id') as ICAL.Time).toUnixTime() ===
          recurrenceStart
    );
}

/**
 * The occurrence's RECURRENCE-ID as the master's rule produces it — same value
 * type and zone as DTSTART, which RFC 5545 requires of RECURRENCE-ID, EXDATE
 * and UNTIL alike.
 */
function occurrenceTime(
  master: ICAL.Component,
  recurrenceStart: number
): ICAL.Time {
  const iterator = new ICAL.Event(master).iterator();
  for (let i = 0, next = iterator.next(); next && i < 5000; i++) {
    const at = next.toUnixTime();
    if (at === recurrenceStart) return next;
    if (at > recurrenceStart) break;
    next = iterator.next();
  }
  // Not on the rule (an RDATE, or a rule edited since): the instant itself.
  const dtstart = new ICAL.Event(master).startDate;
  const time = ICAL.Time.fromJSDate(new Date(recurrenceStart * 1000), true);
  if (dtstart.isDate) time.isDate = true;
  return time;
}

/** A date-time property value carrying DTSTART's TZID parameter, if any. */
function setLikeDtstart(
  prop: ICAL.Property,
  master: ICAL.Component,
  value: ICAL.Time
): void {
  const tzid = master.getFirstProperty('dtstart')?.getParameter('tzid');
  prop.setValue(value);
  if (tzid && !value.isDate && value.zone !== ICAL.Timezone.utcTimezone)
    prop.setParameter('tzid', tzid);
}

/**
 * An occurrence's own times in the form an edit gives them: an all-day end is
 * its last day, not the midnight after it that expandEvents reads from DTEND
 * (toTimePair adds that day back, so passing the occurrence as it is would
 * write it one day longer).
 */
function asEdited(occurrence: { start: Date; end: Date; allDay: boolean }): {
  start: Date;
  end: Date;
  allDay: boolean;
} {
  if (!occurrence.allDay) return occurrence;
  const end = new Date(occurrence.end);
  end.setDate(end.getDate() - 1);
  return {
    start: occurrence.start,
    end: end < occurrence.start ? occurrence.start : end,
    allDay: true,
  };
}

/**
 * Edit ONE occurrence: its override VEVENT (RECURRENCE-ID = the occurrence),
 * created from the master when it does not exist yet — a copy minus the rule
 * (RRULE/RDATE/EXDATE belong to the series only), so attendees, X-* and the
 * rest carry over. `occurrence` is where it currently sits; a time change in
 * `changes` replaces that.
 */
export function editOccurrence(
  ics: string,
  recurrenceStart: number,
  occurrence: { start: Date; end: Date; allDay: boolean },
  changes: EventChanges
): string {
  const vcalendar = new ICAL.Component(ICAL.parse(ics));
  const master = masterVevent(vcalendar);
  if (!master) return ics;

  let override = overrideFor(vcalendar, recurrenceStart);
  const created = !override;
  if (!override) {
    override = new ICAL.Component(structuredClone(master.jCal));
    for (const name of ['rrule', 'rdate', 'exdate', 'recurrence-id'])
      override.removeAllProperties(name);
    const rid = new ICAL.Property('recurrence-id');
    setLikeDtstart(rid, master, occurrenceTime(master, recurrenceStart));
    override.addProperty(rid);
    override.updatePropertyWithValue('dtstamp', utcNow());
    vcalendar.addSubcomponent(override);
  }

  // A time change replaces where the occurrence sits; with none, a fresh
  // override (still carrying the master's first dates) is placed where the
  // occurrence is, and an existing one keeps its own.
  const times =
    changes.start && changes.end
      ? {
          start: changes.start,
          end: changes.end,
          allDay: changes.allDay ?? occurrence.allDay,
        }
      : created
        ? asEdited(occurrence)
        : undefined;
  applyFieldChanges(vcalendar, override, changes, times);
  touch(override);
  return vcalendar.toString();
}

/** Delete ONE occurrence: an EXDATE on the master, and its override if any. */
export function excludeOccurrence(
  ics: string,
  recurrenceStart: number
): string {
  const vcalendar = new ICAL.Component(ICAL.parse(ics));
  const master = masterVevent(vcalendar);
  if (!master) return ics;
  const override = overrideFor(vcalendar, recurrenceStart);
  if (override) vcalendar.removeSubcomponent(override);
  const exdate = new ICAL.Property('exdate');
  setLikeDtstart(exdate, master, occurrenceTime(master, recurrenceStart));
  master.addProperty(exdate);
  touch(master);
  return vcalendar.toString();
}

/** UNTIL for "stop before this occurrence": the day before (all-day), or one
 *  second before in UTC (timed) — UNTIL is inclusive. */
function untilBefore(occurrence: ICAL.Time): ICAL.Time {
  if (occurrence.isDate) {
    const day = occurrence.clone();
    day.day -= 1;
    return day;
  }
  return ICAL.Time.fromJSDate(
    new Date((occurrence.toUnixTime() - 1) * 1000),
    true
  );
}

/** True when the occurrence is the series' first — "this and following"
 *  then means the whole series. */
export function isFirstOccurrence(
  ics: string,
  recurrenceStart: number
): boolean {
  const master = masterVevent(new ICAL.Component(ICAL.parse(ics)));
  if (!master) return true;
  return new ICAL.Event(master).startDate.toUnixTime() === recurrenceStart;
}

/** The series cut off before the occurrence: RRULE ends there (COUNT
 *  dropped for an UNTIL), and overrides from it on are removed. */
function cutAt(
  vcalendar: ICAL.Component,
  master: ICAL.Component,
  recurrenceStart: number
): void {
  const rule = master.getFirstPropertyValue('rrule') as ICAL.Recur | null;
  if (rule) {
    const until = untilBefore(occurrenceTime(master, recurrenceStart));
    const data = { ...rule.toJSON(), until, count: undefined };
    master.updatePropertyWithValue('rrule', ICAL.Recur.fromData(data));
  }
  for (const v of vcalendar.getAllSubcomponents('vevent')) {
    const rid = v.getFirstPropertyValue('recurrence-id') as ICAL.Time | null;
    if (rid && rid.toUnixTime() >= recurrenceStart)
      vcalendar.removeSubcomponent(v);
  }
}

/** Delete this occurrence and every later one. */
export function truncateSeries(ics: string, recurrenceStart: number): string {
  const vcalendar = new ICAL.Component(ICAL.parse(ics));
  const master = masterVevent(vcalendar);
  if (!master) return ics;
  cutAt(vcalendar, master, recurrenceStart);
  touch(master);
  return vcalendar.toString();
}

/** How many times the rule fires before the occurrence — what a COUNT has
 *  already used up by the time the series is split there. */
function firedBefore(master: ICAL.Component, recurrenceStart: number): number {
  const rule = master.getFirstPropertyValue('rrule') as ICAL.Recur;
  const iterator = rule.iterator(new ICAL.Event(master).startDate);
  let n = 0;
  for (let next = iterator.next(); next && n < 5000; next = iterator.next()) {
    if (next.toUnixTime() >= recurrenceStart) break;
    n++;
  }
  return n;
}

/**
 * Edit "this and following": the series is split at the occurrence. The
 * original object keeps everything before it (`head`); a new object with
 * `uid` takes the occurrence and everything after (`tail`) — the master's
 * properties with the changes applied, the old rule (a COUNT reduced by the
 * occurrences already past) unless the edit set a new one, and the overrides
 * that fall after the split, moved across.
 */
export function splitSeries(
  ics: string,
  recurrenceStart: number,
  occurrence: { start: Date; end: Date; allDay: boolean },
  changes: EventChanges,
  uid: string
): { head: string; tail: string } {
  const original = new ICAL.Component(ICAL.parse(ics));
  const master = masterVevent(original);
  if (!master) return { head: ics, tail: ics };

  // The tail first, while the original still has its overrides.
  const tail = new ICAL.Component(['vcalendar', [], []]);
  for (const prop of original.getAllProperties())
    tail.addProperty(new ICAL.Property(structuredClone(prop.jCal)));
  for (const tz of original.getAllSubcomponents('vtimezone'))
    tail.addSubcomponent(new ICAL.Component(structuredClone(tz.jCal)));

  const first = new ICAL.Component(structuredClone(master.jCal));
  first.updatePropertyWithValue('uid', uid);
  first.updatePropertyWithValue('sequence', 0);
  first.updatePropertyWithValue('dtstamp', utcNow());
  first.removeAllProperties('rdate');
  // Only the exclusions from the split on; one EXDATE may list several.
  for (const ex of first.getAllProperties('exdate')) {
    const kept = (ex.getValues() as ICAL.Time[]).filter(
      (t) => t.toUnixTime() >= recurrenceStart
    );
    if (kept.length === 0) first.removeProperty(ex);
    else if (kept.length > 1) ex.setValues(kept);
    else ex.setValue(kept[0]);
  }
  const rule = master.getFirstPropertyValue('rrule') as ICAL.Recur | null;
  if (rule?.count) {
    const data = {
      ...rule.toJSON(),
      count: rule.count - firedBefore(master, recurrenceStart),
    };
    first.updatePropertyWithValue('rrule', ICAL.Recur.fromData(data));
  }
  const times =
    changes.start && changes.end
      ? {
          start: changes.start,
          end: changes.end,
          allDay: changes.allDay ?? occurrence.allDay,
        }
      : asEdited(occurrence);
  // Where the rule had the occurrence: the new series starts from there.
  const before = occurrenceTime(master, recurrenceStart);
  applyFieldChanges(tail, first, changes, times);
  if (changes.recurrence !== undefined)
    applyRecurrence(first, changes.recurrence);
  tail.addSubcomponent(first);
  for (const v of original.getAllSubcomponents('vevent')) {
    const rid = v.getFirstPropertyValue('recurrence-id') as ICAL.Time | null;
    if (rid && rid.toUnixTime() >= recurrenceStart) {
      const moved = new ICAL.Component(structuredClone(v.jCal));
      moved.updatePropertyWithValue('uid', uid);
      tail.addSubcomponent(moved);
    }
  }
  // A new time for the new series moves its exclusions and overrides with
  // it, as a whole-series edit does (see shiftExceptions).
  shiftExceptions(
    tail,
    first,
    before,
    times.allDay ? 'local' : (writeTimezone(tail, first) ?? 'utc')
  );

  cutAt(original, master, recurrenceStart);
  touch(master);
  return { head: original.toString(), tail: tail.toString() };
}
