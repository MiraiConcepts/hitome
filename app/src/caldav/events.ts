// High-level CalDAV event API used by the UI. Online-first: every call talks to
// Radicale (no local cache yet); writes use If-Match (etag) for lost-update safety.
import * as Crypto from 'expo-crypto';

import {
  calendarColor,
  calendarIcon,
  calendarName,
  getCalendarFor,
  getCalendars,
  getClient,
  getDefaultCalendar,
} from './client';
import {
  buildEventICS,
  editOccurrence,
  editPreserving,
  excludeOccurrence,
  expandEvents,
  isFirstOccurrence,
  splitSeries,
  truncateSeries,
  type EditScope,
} from './ics';
import type { CalEvent, EventChanges, EventIcon, EventInput } from './types';

/** A calendar the editor can create into: URL (write target) + display bits. */
export type CalendarChoice = {
  url: string;
  name: string;
  color?: string;
  icon?: EventIcon;
};

/** Server rejected the write because the object changed underneath us (HTTP 412). */
export class ConflictError extends Error {
  constructor() {
    super('Event changed on the server');
    this.name = 'ConflictError';
  }
}

/**
 * The server would not accept the login (401/403). Worth its own type now that
 * the login is something a person typed: "wrong password" and "off the
 * network" used to land in the same generic banner, which made a rotated
 * password look exactly like being off the tailnet.
 */
export class AuthError extends Error {
  constructor() {
    super('The server rejected the saved login');
    this.name = 'AuthError';
  }
}

/** True for the failures that mean "fix the connection", from any layer —
 *  tsdav reports its discovery 401 as a message string, not a status. */
export function isAuthFailure(err: unknown): boolean {
  if (err instanceof AuthError) return true;
  const message = err instanceof Error ? err.message : '';
  return /invalid credentials|\b401\b|\b403\b/i.test(message);
}

function ensureOk(res: Response, action: string): void {
  if (res.status === 412) throw new ConflictError();
  if (res.status === 401 || res.status === 403) throw new AuthError();
  if (!res.ok) throw new Error(`CalDAV ${action} failed (HTTP ${res.status})`);
}

/** Fetch + expand all events overlapping [rangeStart, rangeEnd) across every
 *  calendar, tagging each event with its source calendar's color + marker icon. */
export async function fetchMonth(
  rangeStart: Date,
  rangeEnd: Date
): Promise<CalEvent[]> {
  const client = await getClient();
  const calendars = await getCalendars();
  const timeRange = {
    start: rangeStart.toISOString(),
    end: rangeEnd.toISOString(),
  };
  // One fetch per calendar in parallel; a single failure fails the month (as the
  // single-calendar version did) rather than silently dropping a calendar.
  const perCalendar = await Promise.all(
    calendars.map(async (calendar) => {
      const objects = await client.fetchCalendarObjects({
        calendar,
        timeRange,
      });
      const source = {
        color: calendarColor(calendar),
        icon: calendarIcon(calendar),
      };
      const events: CalEvent[] = [];
      for (const obj of objects) {
        if (!obj.data) continue;
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
      }
      return events;
    })
  );
  return perCalendar.flat();
}

/** Normalized calendar list for the editor's create-into picker. */
export async function listCalendars(): Promise<CalendarChoice[]> {
  const calendars = await getCalendars();
  return calendars.map((c) => ({
    url: c.url,
    name: calendarName(c),
    ...(calendarColor(c) ? { color: calendarColor(c) } : {}),
    ...(calendarIcon(c) ? { icon: calendarIcon(c) } : {}),
  }));
}

/** URL of the default write calendar — the picker's initial selection. */
export async function defaultCalendarUrl(): Promise<string> {
  return (await getDefaultCalendar()).url;
}

/** Create into `calendarUrl` when given (from the picker), else the default. */
export async function createEvent(
  input: EventInput,
  calendarUrl?: string
): Promise<void> {
  const client = await getClient();
  const calendar = calendarUrl
    ? await getCalendarFor(calendarUrl)
    : await getDefaultCalendar();
  const uid = Crypto.randomUUID();
  const res = await client.createCalendarObject({
    calendar,
    filename: `${uid}.ics`, // Radicale keys the object by filename
    iCalString: buildEventICS(input, uid),
  });
  ensureOk(res, 'create');
}

export type { EditScope };

/**
 * The scope that actually applies: a one-off event, or "this and following"
 * from the series' first occurrence, is simply the whole object.
 */
function effectiveScope(event: CalEvent, scope: EditScope): EditScope {
  if (!event.recurring || event.recurrenceStart === undefined) return 'all';
  if (
    scope === 'following' &&
    isFirstOccurrence(event.raw, event.recurrenceStart)
  )
    return 'all';
  return scope;
}

/** PUT a new body for the event's object, guarded by its etag. */
async function putObject(event: CalEvent, data: string, op: string) {
  const client = await getClient();
  const res = await client.updateCalendarObject({
    calendarObject: {
      url: event.url,
      data,
      etag: event.etag, // If-Match → 412 on concurrent change
    },
  });
  ensureOk(res, op);
}

/**
 * Save edits. For a repeating event `scope` says which occurrences they
 * reach (see ics.ts): the whole series, this occurrence only, or this and
 * every later one — the last a split into two objects, written head first
 * so a failure can be put back.
 */
export async function updateEvent(
  event: CalEvent,
  changes: EventChanges,
  scope: EditScope = 'all'
): Promise<void> {
  const effective = effectiveScope(event, scope);
  if (effective === 'all') {
    // preserves unknown props; a time change shifts the series
    await putObject(
      event,
      editPreserving(event.raw, changes, event.start),
      'update'
    );
    return;
  }
  const recurrenceStart = event.recurrenceStart!;
  if (effective === 'this') {
    await putObject(
      event,
      editOccurrence(event.raw, recurrenceStart, event, changes),
      'update'
    );
    return;
  }
  const uid = Crypto.randomUUID();
  const { head, tail } = splitSeries(
    event.raw,
    recurrenceStart,
    event,
    changes,
    uid
  );
  await putObject(event, head, 'update');
  try {
    const client = await getClient();
    const res = await client.createCalendarObject({
      calendar: await getCalendarFor(event.url),
      filename: `${uid}.ics`,
      iCalString: tail,
    });
    ensureOk(res, 'create');
  } catch (err) {
    // The head is already cut short; put the series back whole rather than
    // leave the later occurrences gone.
    await revertEvent(event).catch(() => {});
    throw err;
  }
}

/** The calendar an event's object lives in (its URL is the calendar's plus
 *  the object name). */
export async function calendarUrlOf(event: CalEvent): Promise<string> {
  return (await getCalendarFor(event.url)).url;
}

/**
 * Move an event (the whole object — every occurrence of a series) to another
 * calendar, with any edits made at the same time. CalDAV has no atomic move:
 * the copy is created in the target first, then the original deleted under
 * its etag; if that delete is refused (changed elsewhere, or a failure), the
 * copy is removed again so the event is never left in both calendars.
 */
export async function moveEvent(
  event: CalEvent,
  toCalendarUrl: string,
  changes: EventChanges
): Promise<void> {
  const client = await getClient();
  const data =
    Object.keys(changes).length > 0
      ? editPreserving(event.raw, changes, event.start)
      : event.raw;
  const calendar = await getCalendarFor(toCalendarUrl);
  const filename = `${event.uid}.ics`;
  const created = await client.createCalendarObject({
    calendar,
    filename,
    iCalString: data,
  });
  ensureOk(created, 'move');
  const del = await client.deleteCalendarObject({
    calendarObject: { url: event.url, etag: event.etag },
  });
  try {
    ensureOk(del, 'move');
  } catch (err) {
    const copyUrl = new URL(filename, calendar.url).href;
    await client
      .deleteCalendarObject({ calendarObject: { url: copyUrl, etag: '' } })
      .catch(() => {});
    throw err;
  }
}

/**
 * Delete. For a repeating event: the whole object, this occurrence (an
 * exclusion), or this and every later one (the rule cut short).
 */
export async function deleteEvent(
  event: CalEvent,
  scope: EditScope = 'all'
): Promise<void> {
  const effective = effectiveScope(event, scope);
  if (effective === 'this') {
    await putObject(
      event,
      excludeOccurrence(event.raw, event.recurrenceStart!),
      'delete'
    );
    return;
  }
  if (effective === 'following') {
    await putObject(
      event,
      truncateSeries(event.raw, event.recurrenceStart!),
      'delete'
    );
    return;
  }
  const client = await getClient();
  const res = await client.deleteCalendarObject({
    calendarObject: { url: event.url, etag: event.etag },
  });
  ensureOk(res, 'delete');
}

/** Undo for a hard delete: re-PUT the original ICS under the original UID, back
 *  into the calendar it came from (not the default). */
export async function restoreEvent(event: CalEvent): Promise<void> {
  const client = await getClient();
  const calendar = await getCalendarFor(event.url);
  const res = await client.createCalendarObject({
    calendar,
    filename: `${event.uid}.ics`,
    iCalString: event.raw,
  });
  ensureOk(res, 'restore');
}

/** Undo for a partial delete (an occurrence, or the rest of a series): put
 *  the object's original ICS back over the edited one. No If-Match — the
 *  object's etag changed with the delete being undone. */
export async function revertEvent(event: CalEvent): Promise<void> {
  const client = await getClient();
  const res = await client.updateCalendarObject({
    calendarObject: { url: event.url, data: event.raw },
  });
  ensureOk(res, 'restore');
}

/** Undo for any delete made with `scope`. */
export async function undoDelete(
  event: CalEvent,
  scope: EditScope
): Promise<void> {
  if (effectiveScope(event, scope) === 'all') await restoreEvent(event);
  else await revertEvent(event);
}
