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
import { buildEventICS, editPreserving, expandEvents } from './ics';
import type { CalEvent, EventChanges, EventInput } from './types';

/** A calendar the editor can create into: URL (write target) + display bits. */
export type CalendarChoice = { url: string; name: string; color?: string };

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

export async function updateEvent(
  event: CalEvent,
  changes: EventChanges
): Promise<void> {
  const client = await getClient();
  const res = await client.updateCalendarObject({
    calendarObject: {
      url: event.url,
      data: editPreserving(event.raw, changes), // preserves unknown props
      etag: event.etag, // If-Match → 412 on concurrent change
    },
  });
  ensureOk(res, 'update');
}

/** Hard delete. For a recurring event this removes the whole series (first cut). */
export async function deleteEvent(event: CalEvent): Promise<void> {
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
