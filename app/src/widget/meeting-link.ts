// Meeting-link discovery for the agenda widget. Pure string logic — no RN or
// tsdav imports — so it stays unit-testable offline.

/** Calendar apps happily store scheme-less URLs ('google.com'); ACTION_VIEW
 * needs a real scheme to resolve, so default to https. */
export function normalizeLink(link: string): string {
  return /^[a-z][a-z0-9+.-]*:/i.test(link) ? link : `https://${link}`;
}

/** Schemes that run code or reach into the device rather than open a page or
 *  an app. Event links are written by other people (invites, shared
 *  calendars), so a tap must never hand one of these to ACTION_VIEW. A
 *  denylist, not an allowlist: zoommtg:, tel:, geo: and friends keep working. */
const UNSAFE_SCHEMES = new Set([
  'javascript',
  'vbscript',
  'data',
  'blob',
  'file',
  'content',
  'intent',
  'android-app',
]);

/**
 * The part of a link between `//` and the path, or undefined for a link that
 * has none (mailto:, tel:, geo:). Browsers read `\\` as `/` in web links, so
 * either ends it: `https://evil.example\\.zoom.us/` goes to evil.example.
 */
function authorityOf(link: string): string | undefined {
  const rest = link.replace(/^[a-z][a-z0-9+.-]*:/i, '');
  if (!/^[/\\]{2}/.test(rest)) return undefined;
  return rest.slice(2).split(/[/\\?#]/, 1)[0];
}

/** Whether the link names a login before its host (`name@host`), which an
 *  event link only ever uses to make another host read as the real one. */
function hasUserinfo(link: string): boolean {
  return authorityOf(link)?.includes('@') ?? false;
}

/** The host a link reaches, lowercased and without its port or any login
 *  before it; '' when it has none. */
export function hostOf(link: string): string {
  const authority = authorityOf(link) ?? '';
  return authority
    .slice(authority.lastIndexOf('@') + 1)
    .replace(/:\d*$/, '')
    .toLowerCase();
}

/** `normalizeLink`, or undefined when the link's scheme is unsafe to open or
 *  it names a login before its host. */
export function openableLink(link: string): string | undefined {
  const normalized = normalizeLink(link.trim());
  const scheme = normalized.slice(0, normalized.indexOf(':')).toLowerCase();
  return UNSAFE_SCHEMES.has(scheme) || hasUserinfo(normalized)
    ? undefined
    : normalized;
}

/** Hosts whose URLs are joinable meetings (matched as host or subdomain). */
const MEETING_HOSTS = [
  'meet.google.com',
  'zoom.us',
  'teams.microsoft.com',
  'teams.live.com',
  'webex.com',
  'whereby.com',
  'meet.jit.si',
  'join.skype.com',
  'facetime.apple.com',
];

export function isMeetingLink(url: string): boolean {
  if (hasUserinfo(url)) return false;
  const host = hostOf(url);
  return MEETING_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

const URL_IN_TEXT = /https?:\/\/[^\s<>"')\]]+/gi;

/** Sentence punctuation after a URL, which is not part of it. */
const TRAILING = '.,;!?';

/** `url` without its trailing punctuation. A loop rather than a regex, which
 *  would take quadratic time over a long run of it. */
function trimTrailing(url: string): string {
  let end = url.length;
  while (end > 0 && TRAILING.includes(url[end - 1])) end--;
  return url.slice(0, end);
}

/** The first meeting-host URL in free text, trailing punctuation stripped. */
export function meetingLinkInText(text: string): string | undefined {
  for (const match of text.match(URL_IN_TEXT) ?? []) {
    const url = trimTrailing(match);
    if (isMeetingLink(url)) return url;
  }
  return undefined;
}

/**
 * The event's joinable meeting URL, if any. RFC 7986 gave join links a home in
 * CONFERENCE, but support is thin and writers scatter them, so we look in every
 * field that carries one. Sources, most-trusted first: the CONFERENCE property
 * (that is its whole purpose, any https value counts), the URL property when it
 * points at a known meeting host, then the first meeting-host URL in the
 * location — LOCATION is free-form TEXT, and plenty of writers put the join
 * link there rather than a place — then in the description text.
 */
export function findMeetingLink(e: {
  conference?: string;
  link?: string;
  location?: string;
  description?: string;
}): string | undefined {
  const conference = e.conference?.trim();
  if (
    conference &&
    /^https?:\/\//i.test(conference) &&
    !hasUserinfo(conference)
  ) {
    return conference;
  }
  if (e.link) {
    const normalized = openableLink(e.link);
    if (normalized && isMeetingLink(normalized)) return normalized;
  }
  return (
    (e.location && meetingLinkInText(e.location)) ||
    (e.description && meetingLinkInText(e.description)) ||
    undefined
  );
}
