import { DAVClient, type DAVCalendar } from 'tsdav';

import { DAV } from '@/config';

import type { EventIcon } from './types';

// Lazily-created, cached CalDAV client + calendar list. Online-first: a single
// logged-in client is reused across calls. A failed connect/discovery resets the
// cache so the next call retries rather than replaying a rejected promise.
let clientPromise: Promise<DAVClient> | null = null;
let calendarsPromise: Promise<DAVCalendar[]> | null = null;

// The account's primary calendar: new events default here and it's the write
// fallback. CalDAV/Radicale expose no "default calendar" flag, so match the
// known display name and fall back to discovery order. Personal single-user
// app — safe to hardcode; update here if the calendar is renamed server-side.
const DEFAULT_CALENDAR_NAME = 'carrein-calendar';

// Per-calendar marker glyph, by calendar name — the one place (with
// DEFAULT_CALENDAR_NAME) that personal calendar identity is hardcoded. Basil has
// no cake, so the birthday calendar draws a gift instead of the generic sun.
const CALENDAR_ICON: Record<string, EventIcon> = { 'carrein-birthday': 'gift' };

async function connect(): Promise<DAVClient> {
  // Credential-less by default — the reverse proxy injects Authorization on
  // /dav/* (verified: tsdav completes the full round-trip with empty
  // credentials). Username/password attach only when provided (dev fallback
  // pointing straight at Radicale).
  const hasCreds = Boolean(DAV.user && DAV.pass);
  const client = new DAVClient({
    serverUrl: DAV.url,
    credentials: hasCreds ? { username: DAV.user, password: DAV.pass } : {},
    authMethod: 'Basic',
    defaultAccountType: 'caldav',
  });
  await client.login(); // PROPFIND: discovers principal + calendar-home-set
  return client;
}

export function getClient(): Promise<DAVClient> {
  if (!clientPromise) {
    clientPromise = connect().catch((err) => {
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise;
}

/** All discovered calendars (cached). Reads/rendering cover every calendar. */
export function getCalendars(): Promise<DAVCalendar[]> {
  if (!calendarsPromise) {
    calendarsPromise = getClient()
      .then(async (client) => {
        const calendars = await client.fetchCalendars();
        if (!calendars.length) throw new Error('No CalDAV calendars found');
        return calendars;
      })
      .catch((err) => {
        calendarsPromise = null;
        throw err;
      });
  }
  return calendarsPromise;
}

/** Human name for a calendar (tsdav types displayName as string | Record); falls
 *  back to the collection's URL tail (…/carrein-calendar/ → carrein-calendar). */
export function calendarName(calendar: DAVCalendar): string {
  const name = calendar.displayName;
  if (typeof name === 'string' && name.trim()) return name.trim();
  const tail = calendar.url.replace(/\/+$/, '').split('/').pop() ?? '';
  return decodeURIComponent(tail) || calendar.url;
}

/** The calendar's CalDAV color, or undefined when it has none.
 *
 * tsdav types `calendarColor` as a string, but it comes from parsed XML: a
 * calendar with no `<calendar-color>` (or an empty one) yields a truthy
 * non-string instead of undefined, which then slips past a `?? fallback` guard
 * and reaches the hex parsers. Same reason calendarName() checks its type. */
export function calendarColor(calendar: DAVCalendar): string | undefined {
  const color = calendar.calendarColor;
  return typeof color === 'string' && color.trim() ? color.trim() : undefined;
}

/** The calendar's marker glyph (CALENDAR_ICON), or undefined for the generic
 *  sun/repeat/alarm markers. */
export function calendarIcon(calendar: DAVCalendar): EventIcon | undefined {
  return CALENDAR_ICON[calendarName(calendar).toLowerCase()];
}

function pickDefault(calendars: DAVCalendar[]): DAVCalendar {
  const primary = calendars.find(
    (c) => calendarName(c).toLowerCase() === DEFAULT_CALENDAR_NAME
  );
  return primary ?? calendars[0];
}

/** Default calendar for writes: the known primary by name, else discovery order. */
export function getDefaultCalendar(): Promise<DAVCalendar> {
  return getCalendars().then(pickDefault);
}

/**
 * The calendar that owns `url`, or the default when nothing matches. Longest-
 * prefix match handles both a picked collection URL (create-into target) and an
 * event's object URL (restore a delete back into its original calendar).
 */
export function getCalendarFor(url: string): Promise<DAVCalendar> {
  return getCalendars().then((calendars) => {
    const owning = calendars
      .filter((c) => url.startsWith(c.url))
      .sort((a, b) => b.url.length - a.url.length)[0];
    return owning ?? pickDefault(calendars);
  });
}

/** Drop cached connection (after a config change or auth failure). */
export function resetClient(): void {
  clientPromise = null;
  calendarsPromise = null;
}
