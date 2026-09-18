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

/** Why a connection attempt failed, in the terms the person can act on. */
export type ConnectFailure =
  | 'bad-url'
  | 'unauthorized'
  | 'unreachable'
  | 'no-calendars'
  | 'blocked-by-browser'
  | 'unknown';

/**
 * tsdav reports failures as message strings, so this reads them. Narrow
 * matches on purpose: an unrecognized failure is 'unknown' and shows the
 * server's own words, which beats a confident wrong guess.
 */
export function classifyConnectError(err: unknown): ConnectFailure {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  // tsdav: `Invalid credentials: PROPFIND <url> returned 401 Unauthorized`.
  if (lower.includes('invalid credentials') || lower.includes('401'))
    return 'unauthorized';
  if (lower.includes('403') || lower.includes('forbidden'))
    return 'unauthorized';
  if (lower.includes('no caldav calendars found')) return 'no-calendars';
  // The browser refuses a cross-origin CalDAV preflight before any response
  // exists, so fetch rejects with a bare "Failed to fetch" and no status.
  if (lower.includes('cors') || lower.includes('failed to fetch'))
    return 'blocked-by-browser';
  if (
    lower.includes('network request failed') ||
    lower.includes('econnrefused') ||
    lower.includes('enotfound') ||
    lower.includes('timeout')
  )
    return 'unreachable';
  if (lower.includes('invalid url')) return 'bad-url';
  return 'unknown';
}

/** What to put under the Save button when a connection attempt fails. */
export function connectFailureMessage(
  failure: ConnectFailure,
  fallback: string
): string {
  switch (failure) {
    case 'bad-url':
      return 'That does not look like a server address.';
    case 'unauthorized':
      return 'The server rejected that login.';
    case 'unreachable':
      return 'Could not reach that server. Check the address, and that you are on the network it lives on.';
    case 'no-calendars':
      return 'Connected, but that account has no calendars.';
    case 'blocked-by-browser':
      return 'The browser blocked this request. A server on another address has to send CORS headers for the web app to reach it.';
    case 'unknown':
      return fallback;
  }
}
