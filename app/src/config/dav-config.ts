// Pure CalDAV-connection logic: the stored shape, URL normalization, and the
// classification of a failed connection attempt into something worth showing a
// person. No react-native / tsdav imports, so it stays unit-testable under bun.

export type DavConfig = {
  /** Absolute, with a trailing slash. */
  url: string;
  /** Empty when the server in front supplies credentials (a proxy that injects
   *  Authorization) — that is a supported setup, not an incomplete one. */
  username: string;
  password: string;
};

export type DavStatus = 'loading' | 'configured' | 'unconfigured';

/**
 * Tidy a typed-in server address. People paste with stray spaces, omit the
 * scheme, and leave the trailing slash off — all three are the same server.
 * Returns null when there is nothing usable, which is the form's "that is not
 * an address" answer.
 */
export function normalizeDavUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Some other scheme (ftp://, webcal://) is a typo or the wrong thing pasted,
  // not a host to put https:// in front of.
  if (
    /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) &&
    !/^https?:\/\//i.test(trimmed)
  )
    return null;
  // A bare host is by far the most common paste; https is the only sane guess
  // for a CalDAV server, and http:// can still be typed explicitly.
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return null;
  }
  if (!parsed.hostname) return null;
  // Discovery walks down from a collection path, so a trailing slash is not
  // cosmetic — `/dav` and `/dav/` resolve relative hrefs differently.
  if (!parsed.pathname.endsWith('/')) parsed.pathname += '/';
  return parsed.href;
}

/** How long a connection check may take before it is called a failure. A
 *  request to an address that never answers otherwise waits forever. */
export const CONNECT_TIMEOUT_MS = 15_000;

/** Thrown by probeConnection when CONNECT_TIMEOUT_MS runs out. */
export class ConnectTimeoutError extends Error {
  constructor() {
    super('Connection check timed out');
    this.name = 'ConnectTimeoutError';
  }
}

/** Thrown when the login works but the account has no calendars. */
export class NoCalendarsError extends Error {
  constructor() {
    super('No CalDAV calendars found');
    this.name = 'NoCalendarsError';
  }
}

/** Why a connection attempt failed, in the terms the person can act on. */
export type ConnectFailure =
  | 'bad-url'
  | 'needs-login'
  | 'unauthorized'
  | 'forbidden'
  | 'not-caldav'
  | 'no-such-host'
  | 'cleartext-blocked'
  | 'unreachable'
  | 'insecure'
  | 'timeout'
  | 'no-calendars'
  | 'blocked-by-browser'
  | 'unknown';

/**
 * tsdav reports failures as message strings, so this reads them. Narrow
 * matches on purpose: an unrecognized failure is 'unknown' and shows the
 * server's own words, which beats a confident wrong guess.
 *
 * `hadLogin` separates "this server wants a password" from "that password is
 * wrong" — the same 401 either way, but a different thing to fix.
 *
 * The strings below are what tsdav and the runtimes actually produce (checked
 * against a throwaway Radicale and some deliberately wrong addresses). On
 * Android, React Native's fetch passes OkHttp's exception through as
 * `fetch failed: java.net.UnknownHostException: Unable to resolve host …`, so
 * the Java exception names are what to match there; Bun and Node use the
 * errno-style codes (ENOTFOUND, ECONNREFUSED).
 */
export function classifyConnectError(
  err: unknown,
  { hadLogin = false }: { hadLogin?: boolean } = {}
): ConnectFailure {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  // The app's own failures carry their type; everything below reads other
  // code's words.
  if (err instanceof ConnectTimeoutError) return 'timeout';
  if (err instanceof NoCalendarsError) return 'no-calendars';
  // tsdav: `Invalid credentials: PROPFIND <url> returned 401 Unauthorized`.
  if (lower.includes('invalid credentials') || /\b401\b/.test(lower))
    return hadLogin ? 'unauthorized' : 'needs-login';
  if (/\b403\b/.test(lower) || lower.includes('forbidden')) return 'forbidden';
  if (lower.includes('no caldav calendars found')) return 'no-calendars';
  // Something answered, but not with WebDAV: tsdav could not find the
  // principal (or, past it, the calendar home) in what came back.
  if (
    lower.includes('cannot find principalurl') ||
    lower.includes('cannot find homeurl') ||
    lower.includes('collection query failed')
  )
    return 'not-caldav';
  // The browser refuses a cross-origin CalDAV preflight before any response
  // exists, so fetch rejects with a bare "Failed to fetch" and no status.
  if (lower.includes('cors') || lower.includes('failed to fetch'))
    return 'blocked-by-browser';
  // Android refuses plain http:// in release builds unless a server is listed
  // as allowed; OkHttp says so as an UnknownServiceException.
  if (lower.includes('cleartext')) return 'cleartext-blocked';
  if (
    lower.includes('unknownhostexception') ||
    lower.includes('unable to resolve host') ||
    lower.includes('enotfound')
  )
    return 'no-such-host';
  if (
    lower.includes('certificate') ||
    lower.includes('trust anchor') ||
    lower.includes('chain validation') ||
    lower.includes('ssl') ||
    lower.includes('tls')
  )
    return 'insecure';
  if (
    lower.includes('network request failed') ||
    lower.includes('connectexception') ||
    lower.includes('noroutetohostexception') ||
    lower.includes('sockettimeoutexception') ||
    lower.includes('failed to connect') ||
    lower.includes('network is unreachable') ||
    lower.includes('unable to connect') ||
    lower.includes('econnrefused') ||
    lower.includes('timeout') ||
    lower.includes('timed out')
  )
    return 'unreachable';
  if (lower.includes('invalid url')) return 'bad-url';
  return 'unknown';
}

/** What to show under the fields when a connection attempt fails. */
export function connectFailureMessage(
  failure: ConnectFailure,
  fallback: string
): string {
  switch (failure) {
    case 'bad-url':
      return 'That isn’t a server address. It should look like https://your-server/dav/.';
    case 'needs-login':
      return 'This server needs a username and password.';
    case 'unauthorized':
      return 'The server didn’t accept that username and password.';
    case 'forbidden':
      return 'That account isn’t allowed to open this address. Check that the address belongs to that user.';
    case 'not-caldav':
      return 'Something answered at that address, but it isn’t a calendar server. Check the path: it should point at your CalDAV server, not a website.';
    case 'no-such-host':
      return 'Couldn’t find a server by that name. Check the spelling, and that this phone is on the network or VPN the server is on.';
    case 'cleartext-blocked':
      return 'This app only connects over HTTPS. Use an address that starts with https://.';
    case 'unreachable':
      return 'Couldn’t reach that server. Check the address and port, that the server is running, and that this phone can reach it over Wi-Fi or VPN.';
    case 'insecure':
      return 'Couldn’t make a secure connection. The server’s certificate may be self-signed, expired or for another name, or the server doesn’t use HTTPS at all.';
    case 'timeout':
      return `The server didn’t answer within ${CONNECT_TIMEOUT_MS / 1000} seconds. Check the address and your connection.`;
    case 'no-calendars':
      return 'Signed in, but there are no calendars here. Create one on the server, or check the address points at your account.';
    case 'blocked-by-browser':
      return 'The browser blocked this request. A server on another address has to send CORS headers for the web app to reach it.';
    case 'unknown':
      return `Couldn’t connect: ${plainReason(fallback)}`;
  }
}

/**
 * The readable end of a runtime error: Android's fetch wraps the cause as
 * `fetch failed: java.net.SomeException: what happened`, and only the last
 * part means anything to a person.
 */
function plainReason(message: string): string {
  return message
    .replace(/^fetch failed:\s*/i, '')
    .replace(/^(?:[a-z_$][\w$]*\.)+[A-Z]\w*(?:Exception|Error):\s*/, '');
}
