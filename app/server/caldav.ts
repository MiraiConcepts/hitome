// Talking to the calendar server on someone's behalf: checking a login, and
// passing the app's /dav/ requests through with it.

/** How long a login check may take before the server counts as unreachable. */
const CHECK_TIMEOUT_MS = 15_000;

export type LoginCheck = 'ok' | 'bad-login' | 'not-caldav' | 'unreachable';

export function basicAuth(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`;
}

/**
 * Does the calendar server accept this login? A PROPFIND on its root is what
 * every CalDAV client starts with: 207 means yes; 401/403 means the login is
 * wrong; anything else means something other than a calendar server answered.
 */
export async function checkLogin(
  caldavUrl: string,
  username: string,
  password: string
): Promise<LoginCheck> {
  let res: Response;
  try {
    res = await fetch(caldavUrl, {
      method: 'PROPFIND',
      headers: {
        Depth: '0',
        Authorization: basicAuth(username, password),
        'Content-Type': 'application/xml; charset=utf-8',
      },
      body: '<?xml version="1.0"?><propfind xmlns="DAV:"><prop><current-user-principal/></prop></propfind>',
      redirect: 'manual',
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
  } catch {
    return 'unreachable';
  }
  await res.body?.cancel();
  if (res.status === 207) return 'ok';
  if (res.status === 401 || res.status === 403) return 'bad-login';
  if (res.status >= 500) return 'unreachable';
  return 'not-caldav';
}

/** Headers that describe one hop, not the message; never passed along. */
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

/**
 * The upstream address for an app request under /dav/, or null when the path
 * would climb out of the calendar server's base (a `..` the URL parser left).
 */
export function upstreamUrl(
  caldavUrl: string,
  pathname: string,
  search: string
): string | null {
  const base = new URL(caldavUrl);
  const rest = pathname.replace(/^\/dav\/?/, '');
  const target = new URL(rest + search, base);
  if (
    target.origin !== base.origin ||
    !target.pathname.startsWith(base.pathname)
  )
    return null;
  return target.href;
}

/**
 * Forward an app request to the calendar server with the session's login.
 * The browser's own cookies and Authorization never travel upstream, and a
 * login challenge never travels back: the browser would answer it with its
 * own password box.
 */
export async function forward(
  req: Request,
  target: string,
  authorization: string
): Promise<Response> {
  const headers = new Headers();
  for (const [name, value] of req.headers) {
    const lower = name.toLowerCase();
    if (HOP_BY_HOP.has(lower)) continue;
    if (
      ['cookie', 'authorization', 'host', 'origin', 'referer'].includes(lower)
    )
      continue;
    headers.set(name, value);
  }
  headers.set('Authorization', authorization);
  // Radicale writes the hrefs in its replies under this prefix, so the app
  // can follow them back through /dav/.
  headers.set('X-Script-Name', '/dav');
  const hasBody = !['GET', 'HEAD'].includes(req.method);
  const upstream = await fetch(target, {
    method: req.method,
    headers,
    body: hasBody ? await req.arrayBuffer() : undefined,
    redirect: 'manual',
  });
  const out = new Headers();
  for (const [name, value] of upstream.headers) {
    const lower = name.toLowerCase();
    if (HOP_BY_HOP.has(lower)) continue;
    // fetch has already decoded the body, so its encoding and length no
    // longer describe what is sent on.
    if (
      [
        'www-authenticate',
        'set-cookie',
        'content-encoding',
        'content-length',
      ].includes(lower)
    )
      continue;
    out.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}
