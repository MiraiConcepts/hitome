// The Android backend: the app's event operations against the phone's
// calendar store, which a sync app (DAVx⁵, Google) keeps in step with the
// server. Same exports and meaning as caldav/events.ts — data/events picks
// one per platform. The store is local, so writes never meet a network:
// offline edits simply wait in the store for the sync app to send them.
import type { EditScope } from '@/caldav/ics';
import type { CalEvent, EventChanges, EventInput } from '@/caldav/types';
import { ensureDefaultCalendar } from '@/config/calendar-pref';
import { isStoreDisconnected } from '@/config/store-connection';

import {
  CalendarStore,
  type StoreRow,
  type StoreValues,
} from '../../modules/calendar-store';
import {
  ACCESS_CONTRIBUTOR,
  CALENDAR_COLUMNS,
  EVENT_COLUMNS,
  INSTANCE_COLUMNS,
  STATUS_CANCELED,
  STATUS_CONFIRMED,
  URI,
} from './contract';
import {
  addExdate,
  addLocalDays,
  argbToHex,
  calendarIcon,
  calendarUrl,
  firedBefore,
  instanceToEvent,
  parseCalendarUrl,
  parseEventUrl,
  remainingRule,
  noShift,
  reminderValues,
  rruleFor,
  sameLengthEnd,
  seriesIdOf,
  type Shift,
  shiftBetween,
  shiftExdate,
  shiftLocal,
  shiftStoreMs,
  timeValues,
  truncateRule,
  utcDayToLocal,
} from './map';

export type { EditScope };
export type CalendarChoice = {
  url: string;
  name: string;
  color?: string;
  icon?: CalEvent['icon'];
};

/** Kept for the shared interface: the store has no concurrent writer to
 *  refuse an edit, so this is never thrown here. */
export class ConflictError extends Error {
  constructor() {
    super('Event changed on the server');
    this.name = 'ConflictError';
  }
}

/** No calendar permission, or no store at all. */
export class StoreUnavailableError extends Error {
  constructor(message = 'Calendar access is off') {
    super(message);
    this.name = 'StoreUnavailableError';
  }
}

export function isAuthFailure(err: unknown): boolean {
  return err instanceof StoreUnavailableError;
}

type Store = NonNullable<typeof CalendarStore>;
let testStore: Pick<Store, 'query' | 'insert' | 'update' | 'delete'> | null =
  null;

/** Tests only: run the operations against an in-memory store. */
export function setStoreForTests(fake: typeof testStore): void {
  testStore = fake;
}

function store() {
  if (testStore) return testStore;
  if (!CalendarStore) throw new StoreUnavailableError('No calendar store');
  return CalendarStore;
}

/** Device zone for new timed events (the store repeats in it). */
function zone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

const n = (v: StoreRow[string]) => (typeof v === 'number' ? v : Number(v));

// ---- Calendars -------------------------------------------------------------

type StoreCalendar = CalendarChoice & { id: string; writable: boolean };

async function calendars(): Promise<StoreCalendar[]> {
  // Disconnected in Settings: no calendars, so nothing anywhere reads one.
  if (isStoreDisconnected()) return [];
  const rows = await store().query(
    URI.calendars,
    CALENDAR_COLUMNS,
    'visible = 1 AND sync_events = 1',
    null,
    'isPrimary DESC, _id ASC'
  );
  return rows.map((row) => {
    const id = String(n(row._id));
    const name = String(row.calendar_displayName ?? '');
    const color = argbToHex(row.calendar_color);
    const icon = calendarIcon(name);
    return {
      id,
      url: calendarUrl(id),
      name,
      ...(color ? { color } : {}),
      ...(icon ? { icon } : {}),
      writable: n(row.calendar_access_level) >= ACCESS_CONTRIBUTOR,
    };
  });
}

/** Calendars new events can go into. */
export async function listCalendars(): Promise<CalendarChoice[]> {
  return (await calendars())
    .filter((c) => c.writable)
    .map(({ url, name, color, icon }) => ({
      url,
      name,
      ...(color ? { color } : {}),
      ...(icon ? { icon } : {}),
    }));
}

export async function defaultCalendarUrl(): Promise<string> {
  const [list, preferred] = await Promise.all([
    listCalendars(),
    ensureDefaultCalendar(),
  ]);
  const chosen = preferred && list.find((c) => c.url === preferred);
  const first = chosen || list[0];
  if (!first) throw new StoreUnavailableError('No calendars on this phone');
  return first.url;
}

export async function calendarUrlOf(event: CalEvent): Promise<string> {
  const parsed = parseEventUrl(event.url);
  return parsed ? calendarUrl(parsed.calendarId) : '';
}

// ---- Reading ---------------------------------------------------------------

export async function fetchMonth(
  rangeStart: Date,
  rangeEnd: Date
): Promise<CalEvent[]> {
  const visible = await calendars();
  if (visible.length === 0) return [];
  const ids = visible.map((c) => c.id);
  const marks = ids.map(() => '?').join(',');
  // All-day rows sit at UTC midnight, which can fall outside a local range
  // by the zone's offset — widen by a day each side, then trim.
  const rows = await store().query(
    URI.instances(
      rangeStart.getTime() - 86_400_000,
      rangeEnd.getTime() + 86_400_000
    ),
    INSTANCE_COLUMNS,
    `calendar_id IN (${marks}) AND (eventStatus IS NULL OR eventStatus != ${STATUS_CANCELED})`,
    ids,
    'begin ASC'
  );
  const eventIds = [
    ...new Set(
      rows.flatMap((r) => [
        String(n(r.event_id)),
        r.original_id ? String(r.original_id) : null,
      ])
    ),
  ].filter((v): v is string => Boolean(v));
  const [alarms, overridden] = await Promise.all([
    firstAlarms(eventIds),
    seriesWithExceptions([
      ...new Set(rows.filter((r) => r.rrule).map((r) => String(n(r.event_id)))),
    ]),
  ]);
  return rows
    .map((row) => instanceToEvent(row, { alarms, overridden }))
    .filter((e) => e.end > rangeStart && e.start < rangeEnd);
}

async function firstAlarms(eventIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (eventIds.length === 0) return out;
  const rows = await store().query(
    URI.reminders,
    ['event_id', 'minutes'],
    `event_id IN (${eventIds.map(() => '?').join(',')})`,
    eventIds,
    'minutes ASC'
  );
  for (const row of rows) {
    const id = String(n(row.event_id));
    if (!out.has(id)) out.set(id, n(row.minutes));
  }
  return out;
}

async function seriesWithExceptions(seriesIds: string[]): Promise<Set<string>> {
  if (seriesIds.length === 0) return new Set();
  const rows = await store().query(
    URI.events,
    ['original_id'],
    `original_id IN (${seriesIds.map(() => '?').join(',')}) AND deleted = 0`,
    seriesIds,
    null
  );
  return new Set(rows.map((r) => String(r.original_id)));
}

// ---- Rows ------------------------------------------------------------------

async function eventRow(id: string): Promise<StoreRow> {
  const [row] = await store().query(
    URI.event(id),
    EVENT_COLUMNS,
    null,
    null,
    null
  );
  if (!row) throw new Error('That event is no longer on this phone');
  return row;
}

/** Whether the sync app has given the event its id on the server yet. */
async function hasSyncId(id: string): Promise<boolean> {
  const [row] = await store().query(
    URI.event(id),
    ['_sync_id'],
    null,
    null,
    null
  );
  return typeof row?._sync_id === 'string' && row._sync_id !== '';
}

async function exceptionRows(seriesId: string): Promise<StoreRow[]> {
  return store().query(
    URI.events,
    EVENT_COLUMNS,
    'original_id = ? AND deleted = 0',
    [seriesId],
    'originalInstanceTime ASC'
  );
}

async function reminderRows(eventId: string): Promise<StoreRow[]> {
  return store().query(
    URI.reminders,
    ['minutes', 'method'],
    'event_id = ?',
    [eventId],
    null
  );
}

/**
 * A rule change as the store needs it: with the event's time fields beside
 * it. Updating RRULE alone leaves Android's expanded occurrences as they
 * were — a cut series kept showing its old tail — while the full set makes
 * the provider expand the event again (Etar writes them together too).
 */
function ruleUpdate(row: StoreRow, rrule: string | null): StoreValues {
  return {
    rrule,
    dtstart: row.dtstart,
    duration: row.duration,
    eventTimezone: row.eventTimezone,
    allDay: row.allDay,
  };
}

/** The writable copy of a row: everything but identity and bookkeeping.
 *  Empty fields are left out, not written as null — the provider unboxes
 *  some integer columns (eventStatus among them) and crashes on a null. */
function copyable(row: StoreRow): StoreValues {
  const out: StoreValues = {};
  for (const key of EVENT_COLUMNS) {
    if (key === '_id' || key === 'original_id') continue;
    if (row[key] !== undefined && row[key] !== null) out[key] = row[key];
  }
  return out;
}

async function setReminders(eventId: string, minutes: number[]) {
  await store().delete(URI.reminders, 'event_id = ?', [eventId]);
  for (const m of minutes)
    await store().insert(URI.reminders, {
      event_id: Number(eventId),
      minutes: m,
      method: 1,
    });
}

/** A whole series as it stands: its row, exceptions, reminders. Enough to
 *  put it back (undo) or write it elsewhere (move). */
type Snapshot = {
  row: StoreRow;
  exceptions: StoreRow[];
  reminders: number[];
};

async function snapshot(seriesId: string): Promise<Snapshot> {
  const [row, exceptions, reminders] = await Promise.all([
    eventRow(seriesId),
    exceptionRows(seriesId),
    reminderRows(seriesId),
  ]);
  return { row, exceptions, reminders: reminders.map((r) => n(r.minutes)) };
}

/** Write a snapshot as a new series (new id) in `calendarId`. */
async function insertSnapshot(
  snap: Snapshot,
  calendarId: string
): Promise<string> {
  const id = await store().insert(URI.events, {
    ...copyable(snap.row),
    calendar_id: Number(calendarId),
  });
  await setReminders(id, snap.reminders);
  for (const ex of snap.exceptions) {
    const values = copyable(ex);
    delete values.calendar_id;
    delete values.rrule;
    await store().insert(URI.exceptions(id), values);
  }
  return id;
}

// ---- Writing ---------------------------------------------------------------

export async function createEvent(
  input: EventInput,
  calendarUrlArg?: string
): Promise<void> {
  const target = parseCalendarUrl(
    calendarUrlArg ?? (await defaultCalendarUrl())
  );
  if (!target) throw new Error('No calendar to create in');
  const repeating = Boolean(input.recurrence);
  const values: StoreValues = {
    calendar_id: Number(target),
    title: input.summary,
    description: input.description ?? null,
    eventLocation: input.location ?? null,
    ...timeValues(input, repeating, zone()),
    ...(input.recurrence
      ? { rrule: rruleFor(input.recurrence, input.start, input.allDay) }
      : {}),
  };
  const id = await store().insert(URI.events, values);
  for (const r of reminderValues(id, input.alarm))
    await store().insert(URI.reminders, r);
}

/** The field changes as store values (times handled by the caller). */
function fieldValues(changes: EventChanges): StoreValues {
  const out: StoreValues = {};
  if (changes.summary !== undefined) out.title = changes.summary;
  if (changes.location !== undefined)
    out.eventLocation = changes.location || null;
  if (changes.description !== undefined)
    out.description = changes.description || null;
  return out;
}

/** The event's own calendar and row ids; throws for an event that is not
 *  one of the store's rather than writing somewhere unknown. */
function storeHandle(event: CalEvent): { calendarId: string; eventId: string } {
  const parsed = parseEventUrl(event.url);
  if (!parsed) throw new Error('That event is not one from this phone');
  return parsed;
}

/** The occurrence's original start in ms (its address in its series). */
const occurrenceMs = (event: CalEvent) =>
  (event.recurrenceStart ?? Math.floor(event.start.getTime() / 1000)) * 1000;

function effectiveScope(
  event: CalEvent,
  scope: EditScope,
  row?: StoreRow
): EditScope {
  if (!event.recurring) return 'all';
  if (scope === 'following' && row && occurrenceMs(event) <= startOfSeries(row))
    return 'all';
  return scope;
}

const startOfSeries = (row: StoreRow) => n(row.dtstart);

/** Whole series: fields, a time shift by the change made to the occurrence
 *  on screen (exceptions move with it), the rule, the alert. */
async function editSeries(
  event: CalEvent,
  changes: EventChanges
): Promise<void> {
  const seriesId = seriesIdOf(event);
  const row = await eventRow(seriesId);
  const values = fieldValues(changes);
  const rule =
    changes.recurrence === undefined
      ? (row.rrule as string | null)
      : changes.recurrence === null
        ? null
        : rruleFor(
            changes.recurrence,
            changes.start ?? event.start,
            changes.allDay ?? event.allDay
          );
  if (changes.recurrence !== undefined) values.rrule = rule;
  let shift: Shift = { days: 0, clockMs: 0 };
  if (changes.start && changes.end) {
    const allDay = changes.allDay ?? event.allDay;
    shift = shiftBetween(event.start, changes.start);
    const seriesStart =
      n(row.allDay) === 1
        ? utcDayToLocal(startOfSeries(row))
        : new Date(startOfSeries(row));
    const start = shiftLocal(seriesStart, shift);
    const end = sameLengthEnd(start, changes.start, changes.end, allDay);
    // A timed event keeps the zone it was made in (as the CalDAV writer does).
    const keep =
      !allDay && n(row.allDay) !== 1 && typeof row.eventTimezone === 'string';
    Object.assign(
      values,
      timeValues(
        { start, end, allDay },
        Boolean(rule),
        keep ? (row.eventTimezone as string) : zone()
      )
    );
  } else if (
    changes.recurrence !== undefined &&
    Boolean(rule) !== Boolean(row.rrule)
  ) {
    // Rule added or removed: DTEND and DURATION swap places.
    const start = event.allDay
      ? utcDayToLocal(startOfSeries(row))
      : new Date(startOfSeries(row));
    const end = sameLengthEnd(start, event.start, event.end, event.allDay);
    Object.assign(
      values,
      timeValues(
        {
          start,
          // An all-day event's end is exclusive; the store wants its last day.
          end: event.allDay ? addLocalDays(end, -1) : end,
          allDay: event.allDay,
        },
        Boolean(rule),
        (row.eventTimezone as string) || zone()
      )
    );
  }
  const sameKind = n(row.allDay) === ((changes.allDay ?? event.allDay) ? 1 : 0);
  // Occurrences taken out by EXDATE (see deleteEvent) move with the series.
  if (!noShift(shift) && sameKind && row.exdate)
    values.exdate = shiftExdate(row.exdate as string, shift);
  if ('rrule' in values && !('dtstart' in values))
    Object.assign(values, ruleUpdate(row, values.rrule as string | null));
  await store().update(URI.event(seriesId), values, null, null);
  if (!noShift(shift) && sameKind) {
    // Exceptions name occurrences by their old start; move them along, or a
    // deleted occurrence comes back and a changed one loses its changes.
    const allDay = n(row.allDay) === 1;
    for (const ex of await exceptionRows(seriesId)) {
      const moved: StoreValues = {
        originalInstanceTime: shiftStoreMs(
          n(ex.originalInstanceTime),
          shift,
          allDay
        ),
      };
      if (n(ex.eventStatus) !== STATUS_CANCELED) {
        const exAllDay = n(ex.allDay) === 1;
        moved.dtstart = shiftStoreMs(n(ex.dtstart), shift, exAllDay);
        if (ex.dtend !== null)
          moved.dtend = shiftStoreMs(n(ex.dtend), shift, exAllDay);
      }
      await store().update(URI.event(String(n(ex._id))), moved, null, null);
    }
  }
  if (changes.alarm !== undefined)
    await setReminders(
      seriesId,
      changes.alarm ? [changes.alarm.offsetMinutes] : []
    );
}

/** One occurrence: its exception row, edited, or created from the series. */
async function editOccurrence(
  event: CalEvent,
  changes: EventChanges
): Promise<void> {
  const parsed = storeHandle(event);
  const values = fieldValues(changes);
  if (changes.start && changes.end) {
    const allDay = changes.allDay ?? event.allDay;
    Object.assign(
      values,
      timeValues(
        { start: changes.start, end: changes.end, allDay },
        false,
        zone()
      )
    );
  }
  const isException = event.etag.startsWith('series:');
  let id = parsed.eventId;
  if (isException) {
    await store().update(URI.event(id), values, null, null);
  } else {
    id = await store().insert(URI.exceptions(parsed.eventId), {
      originalInstanceTime: occurrenceMs(event),
      ...values,
    });
  }
  if (changes.alarm !== undefined)
    await setReminders(id, changes.alarm ? [changes.alarm.offsetMinutes] : []);
}

/** This and every later occurrence: the series stops before it, and a new
 *  series carries the rest with the changes. */
async function editFollowing(
  event: CalEvent,
  changes: EventChanges
): Promise<void> {
  const seriesId = seriesIdOf(event);
  const snap = await snapshot(seriesId);
  const rule = snap.row.rrule as string;
  const allDay = n(snap.row.allDay) === 1;
  const at = occurrenceMs(event);
  const fired = firedBefore(rule, startOfSeries(snap.row), allDay, at);

  // The tail: the old series from this occurrence on, then the changes.
  const tailStart = allDay ? utcDayToLocal(at) : new Date(at);
  const tailEnd = sameLengthEnd(tailStart, event.start, event.end, allDay);
  const tail: Snapshot = {
    row: {
      ...snap.row,
      ...timeValues(
        {
          start: tailStart,
          // An all-day event's end is exclusive; the store wants its last day.
          end: allDay ? addLocalDays(tailEnd, -1) : tailEnd,
          allDay,
        },
        true,
        (snap.row.eventTimezone as string) || zone()
      ),
      rrule: remainingRule(rule, fired),
    } as StoreRow,
    exceptions: snap.exceptions.filter(
      (ex) => n(ex.originalInstanceTime) >= at
    ),
    reminders: snap.reminders,
  };
  await store().update(
    URI.event(seriesId),
    ruleUpdate(snap.row, truncateRule(rule, at, allDay)),
    null,
    null
  );
  for (const ex of tail.exceptions)
    await store().delete(URI.event(String(n(ex._id))), null, null);
  const tailId = await insertSnapshot(tail, String(n(snap.row.calendar_id)));
  // Now the tail is a series of its own: apply the changes to all of it.
  const parsed = storeHandle(event);
  const onTail: CalEvent = {
    ...event,
    url: `store:${parsed.calendarId}/${tailId}`,
    etag: '',
    start: event.start,
  };
  if (Object.keys(changes).length > 0) await editSeries(onTail, changes);
}

export async function updateEvent(
  event: CalEvent,
  changes: EventChanges,
  scope: EditScope = 'all'
): Promise<void> {
  const row = event.recurring ? await eventRow(seriesIdOf(event)) : undefined;
  const effective = effectiveScope(event, scope, row);
  if (effective === 'this') return editOccurrence(event, changes);
  if (effective === 'following') return editFollowing(event, changes);
  return editSeries(event, changes);
}

/**
 * What undoing the last delete needs, keyed by the event it was made on —
 * the store's ids are its own, so undo is "put this snapshot back" rather
 * than replaying ICS as the CalDAV backend does.
 */
const undoTokens = new Map<string, () => Promise<void>>();

export async function deleteEvent(
  event: CalEvent,
  scope: EditScope = 'all'
): Promise<void> {
  const seriesId = seriesIdOf(event);
  const row = event.recurring ? await eventRow(seriesId) : undefined;
  const effective = effectiveScope(event, scope, row);
  const parsed = storeHandle(event);

  if (effective === 'this') {
    if (event.etag.startsWith('series:')) {
      // An already-changed occurrence: cancel its exception.
      const before = await eventRow(parsed.eventId);
      await store().update(
        URI.event(parsed.eventId),
        { eventStatus: STATUS_CANCELED },
        null,
        null
      );
      undoTokens.set(event.id, async () => {
        await store().update(
          URI.event(parsed.eventId),
          { eventStatus: before.eventStatus ?? STATUS_CONFIRMED },
          null,
          null
        );
      });
    } else if (await hasSyncId(seriesId)) {
      const id = await store().insert(URI.exceptions(seriesId), {
        originalInstanceTime: occurrenceMs(event),
        eventStatus: STATUS_CANCELED,
      });
      undoTokens.set(event.id, async () => {
        await store().delete(URI.event(id), null, null);
      });
    } else {
      // A series the sync app has not sent yet (or one in a local calendar)
      // has no sync id, and Android matches a cancelled exception to its
      // series by sync id only: the exception would cancel nothing, and the
      // provider drops the series' expanded occurrences while it is
      // written. An EXDATE on the series takes the one occurrence out.
      const series = row ?? (await eventRow(seriesId));
      const allDay = n(series.allDay) === 1;
      await store().update(
        URI.event(seriesId),
        {
          ...ruleUpdate(series, series.rrule as string | null),
          exdate: addExdate(
            series.exdate as string | null,
            occurrenceMs(event),
            allDay
          ),
        },
        null,
        null
      );
      undoTokens.set(event.id, async () => {
        const now = await eventRow(seriesId);
        await store().update(
          URI.event(seriesId),
          {
            ...ruleUpdate(now, now.rrule as string | null),
            exdate: series.exdate ?? null,
          },
          null,
          null
        );
      });
    }
    return;
  }

  const snap = await snapshot(seriesId);
  if (effective === 'following') {
    const at = occurrenceMs(event);
    const allDay = n(snap.row.allDay) === 1;
    await store().update(
      URI.event(seriesId),
      ruleUpdate(snap.row, truncateRule(snap.row.rrule as string, at, allDay)),
      null,
      null
    );
    const later = snap.exceptions.filter(
      (ex) => n(ex.originalInstanceTime) >= at
    );
    for (const ex of later)
      await store().delete(URI.event(String(n(ex._id))), null, null);
    undoTokens.set(event.id, async () => {
      await store().update(
        URI.event(seriesId),
        ruleUpdate(snap.row, snap.row.rrule as string),
        null,
        null
      );
      for (const ex of later) {
        const values = copyable(ex);
        delete values.calendar_id;
        delete values.rrule;
        await store().insert(URI.exceptions(seriesId), values);
      }
    });
    return;
  }

  await store().delete(URI.event(seriesId), null, null);
  undoTokens.set(event.id, async () => {
    await insertSnapshot(snap, String(n(snap.row.calendar_id)));
  });
}

export async function undoDelete(
  event: CalEvent,
  _scope: EditScope
): Promise<void> {
  const undo = undoTokens.get(event.id);
  if (!undo) throw new Error('Nothing to undo');
  undoTokens.delete(event.id);
  await undo();
}

/** Move a whole event (every occurrence) to another calendar: written there,
 *  then removed here — the store will not change an event's calendar. */
export async function moveEvent(
  event: CalEvent,
  toCalendarUrl: string,
  changes: EventChanges
): Promise<void> {
  const target = parseCalendarUrl(toCalendarUrl);
  if (!target) throw new Error('No calendar to move to');
  const seriesId = seriesIdOf(event);
  const snap = await snapshot(seriesId);
  const newId = await insertSnapshot(snap, target);
  await store().delete(URI.event(seriesId), null, null);
  if (Object.keys(changes).length > 0)
    await editSeries(
      { ...event, url: `store:${target}/${newId}`, etag: '' },
      changes
    );
}

// ---- Sync ------------------------------------------------------------------

/** Ask the sync apps (DAVx⁵…) to sync now; false when there is no store.
 *  What lands then redraws the grid by itself (subscribeStore). */
export async function requestSync(): Promise<boolean> {
  if (!CalendarStore) return false;
  await CalendarStore.requestSync();
  return true;
}

/** Calls back on any change to the store (own writes, a sync landing). */
export function subscribeStore(listener: () => void): () => void {
  if (!CalendarStore) return () => {};
  const sub = CalendarStore.addListener('onChange', listener);
  return () => sub.remove();
}

const DAVX5 = 'at.bitfire.davdroid';
/** Where to get DAVx⁵ (free on F-Droid). */
export const DAVX5_DOWNLOAD =
  'https://f-droid.org/packages/at.bitfire.davdroid/';

/** Open DAVx⁵; false when it is not installed. */
export async function openDavx5(): Promise<boolean> {
  if (!CalendarStore) return false;
  return CalendarStore.openApp(DAVX5);
}
