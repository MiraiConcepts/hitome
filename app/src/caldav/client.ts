import { DAVClient, type DAVCalendar } from 'tsdav';

import { ensureDefaultCalendar } from '@/config/calendar-pref';
import {
  CONNECT_TIMEOUT_MS,
  ConnectTimeoutError,
  NoCalendarsError,
  type DavConfig,
} from '@/config/dav-config';
import { ensureDavConfig, subscribeDavConfig } from '@/config/dav-store';

import type { EventIcon } from './types';

// Lazily-created, cached CalDAV client + calendar list. Online-first: a single
// logged-in client is reused across calls. A failed connect/discovery resets the
// cache so the next call retries rather than replaying a rejected promise.
let clientPromise: Promise<DAVClient> | null = null;
let calendarsPromise: Promise<DAVCalendar[]> | null = null;

// A calendar whose name says birthdays draws a gift instead of the generic
// sun — a name check, so it works for anyone who named the calendar what it
// holds.
const BIRTHDAY_NAME = /birthday/i;

/**
 * A client for one connection. The login is optional: a reverse proxy that
 * injects Authorization on /dav/* (the web deployment, and an Android build
 * pointed at the same endpoint) wants the client to send nothing at all.
 *
 * "Nothing" needs saying carefully. Under Basic — tsdav's default, applied
 * even when no authMethod is given — getBasicAuthHeaders stringifies whatever
 * it is handed, so empty credentials still put
 * `Basic base64("undefined:undefined")` on every request. That has been
 * harmless only because the proxy replaces the header; pointed at a bare
 * Radicale it is a guaranteed 401. 'Custom' with a header function that
 * returns nothing is the one way to actually send no Authorization.
 */
function clientFor(config: DavConfig): DAVClient {
  const hasLogin = Boolean(config.username);
  return new DAVClient({
    serverUrl: config.url,
    credentials: hasLogin
      ? { username: config.username, password: config.password }
      : {},
    ...(hasLogin
      ? { authMethod: 'Basic' as const }
      : { authMethod: 'Custom' as const, authFunction: async () => ({}) }),
    defaultAccountType: 'caldav',
  });
}

async function connect(): Promise<DAVClient> {
  const config = await ensureDavConfig();
  if (!config) throw new Error('No calendar server configured');
  const client = clientFor(config);
  await loginExplained(client, config);
  return client;
}

/**
 * client.login() (the PROPFIND that discovers the principal and
 * calendar-home-set) with a refused login named as one. tsdav's discovery
 * never looks at the status: a 401 comes back as `cannot find principalUrl`,
 * which reads as "not a calendar server" when the login is what changed. So
 * on failure the address is asked once more, plainly: a 401/403 is
 * rethrown in tsdav's own wording for one, which isAuthFailure and
 * classifyConnectError both recognise, and a 5xx as the server being down.
 */
async function loginExplained(
  client: DAVClient,
  config: DavConfig
): Promise<void> {
  try {
    await client.login();
  } catch (err) {
    const status = await statusOf(config).catch(() => null);
    if (status === 401 || status === 403)
      throw new Error(
        `Invalid credentials: PROPFIND ${config.url} returned ${status}`
      );
    // A proxy whose calendar is down answers 502/503/504 itself, and that
    // reaches tsdav as the same missing principal.
    if (status !== null && status >= 500)
      throw new Error(
        `Calendar server unavailable: PROPFIND ${config.url} returned ${status}`
      );
    throw err;
  }
}

/** The HTTP status a bare PROPFIND on the server address answers with. */
async function statusOf(config: DavConfig): Promise<number> {
  const headers: Record<string, string> = { Depth: '0' };
  if (config.username)
    headers.Authorization = `Basic ${btoa(`${config.username}:${config.password}`)}`;
  const res = await fetch(config.url, { method: 'PROPFIND', headers });
  return res.status;
}

/**
 * Connect with a config that is not (yet) the stored one — the settings form's
 * "does this actually work" check, run before anything is saved. Deliberately
 * uncached: it must not become the app's client, and a failure must not poison
 * the real one. Fetching the calendars is part of the check, not extra: an
 * account with none is indistinguishable from an empty calendar afterwards.
 */
export async function probeConnection(
  config: DavConfig
): Promise<DAVCalendar[]> {
  const client = clientFor(config);
  const check = (async () => {
    await loginExplained(client, config);
    const calendars = await client.fetchCalendars();
    if (!calendars.length) throw new NoCalendarsError();
    return calendars;
  })();
  // If the timeout wins, this settles later with nobody waiting on it; the
  // empty catch keeps that from surfacing as an unhandled rejection.
  check.catch(() => {});
  // An address that never answers (a host off the VPN, a firewall that drops
  // rather than refuses) would otherwise leave the form busy for
  // good: React Native's fetch has no timeout of its own. The request itself
  // is left to finish or fail unobserved; nothing waits on it any more.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new ConnectTimeoutError()),
      CONNECT_TIMEOUT_MS
    );
  });
  try {
    return await Promise.race([check, timeout]);
  } finally {
    clearTimeout(timer);
  }
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
        if (!calendars.length) throw new NoCalendarsError();
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
 *  back to the collection's URL tail (…/personal/ → personal). */
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

/** The calendar's marker glyph, or undefined for the generic sun/repeat/alarm
 *  markers. */
export function calendarIcon(calendar: DAVCalendar): EventIcon | undefined {
  return BIRTHDAY_NAME.test(calendarName(calendar)) ? 'gift' : undefined;
}

function pickDefault(
  calendars: DAVCalendar[],
  preferred: string | null
): DAVCalendar {
  // CalDAV exposes no "default calendar" flag, so the choice is the app's:
  // whatever was picked in settings, else discovery order.
  const chosen = preferred
    ? calendars.find((c) => c.url === preferred)
    : undefined;
  return chosen ?? calendars[0];
}

/** Default calendar for writes: the one chosen in settings, else the first
 *  discovered. A stored choice that no longer exists on the server (renamed,
 *  deleted, different account) falls through to the same fallback. */
export async function getDefaultCalendar(): Promise<DAVCalendar> {
  const [calendars, preferred] = await Promise.all([
    getCalendars(),
    ensureDefaultCalendar(),
  ]);
  return pickDefault(calendars, preferred);
}

/**
 * The calendar that owns `url`, or the default when nothing matches. Longest-
 * prefix match handles both a picked collection URL (create-into target) and an
 * event's object URL (restore a delete back into its original calendar).
 */
export function getCalendarFor(url: string): Promise<DAVCalendar> {
  return getCalendars().then(async (calendars) => {
    const owning = calendars
      .filter((c) => url.startsWith(c.url))
      .sort((a, b) => b.url.length - a.url.length)[0];
    if (owning) return owning;
    return pickDefault(calendars, await ensureDefaultCalendar());
  });
}

/** Drop cached connection (after a config change or auth failure). */
export function resetClient(): void {
  clientPromise = null;
  calendarsPromise = null;
}

// A cached client captured its server's URL and credentials when it was
// constructed, so a config change has to take it with it.
subscribeDavConfig(resetClient);
