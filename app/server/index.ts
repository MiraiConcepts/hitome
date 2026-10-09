// hitome's web server: the app's files, its login, and the way through to the
// calendar. The web's twin of DAVx⁵ on Android: it holds the calendar login
// so the browser never does. The browser gets an httpOnly session cookie;
// /dav/ requests carry that cookie here, and go on to the calendar server
// with the login it stands for.
//
// Configuration (environment):
//   CALDAV_URL    the calendar server, e.g. http://radicale:5232/ (required)
//   PORT          where to listen (3000)
//   DATA_DIR      sessions and their key (/data)
//   STATIC_DIR    the exported web app (/srv)
//   DEV_UPSTREAM  development only: proxy the app to Metro at this address
//                 instead of serving STATIC_DIR (e.g. http://localhost:8082)
import { mkdirSync } from 'node:fs';
import { normalize, join, sep } from 'node:path';

import { cacheControl, mayServeShell } from './caching';
import { basicAuth, checkLogin, forward, upstreamUrl } from './caldav';
import { createLimiter } from './limiter';
import { openSessions } from './sessions';

const COOKIE = 'hitome_session';
/** "Until you log out": as long as browsers let a cookie live (400 days),
 *  renewed whenever the app checks in. */
const COOKIE_MAX_AGE_S = 400 * 24 * 60 * 60;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`hitome: set ${name} (see docs/Deploy.md)`);
    process.exit(1);
  }
  return value;
}

/** The calendar address, with the trailing slash discovery depends on. */
function caldavBase(raw: string): string {
  const url = new URL(raw);
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url.href;
}

const CALDAV_URL = caldavBase(requireEnv('CALDAV_URL'));
/** The address shown in Settings: never a login embedded in it. */
const CALDAV_SHOWN = (() => {
  const url = new URL(CALDAV_URL);
  url.username = '';
  url.password = '';
  return url.href;
})();
const PORT = Number(process.env.PORT ?? 3000);
const DATA_DIR = process.env.DATA_DIR ?? '/data';
const STATIC_DIR = process.env.STATIC_DIR ?? '/srv';
const DEV_UPSTREAM = process.env.DEV_UPSTREAM?.replace(/\/+$/, '');

mkdirSync(DATA_DIR, { recursive: true });
const sessions = openSessions(DATA_DIR);
const limiter = createLimiter();

// ---- small helpers --------------------------------------------------------

/** What every response says about how it may be framed and referred. */
const SECURITY_HEADERS: Record<string, string> = {
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

function withSecurity(res: Response): Response {
  for (const [name, value] of Object.entries(SECURITY_HEADERS))
    if (!res.headers.has(name)) res.headers.set(name, value);
  return res;
}

function json(body: unknown, status = 200, extra?: HeadersInit): Response {
  const headers = new Headers(extra);
  headers.set('Content-Type', 'application/json');
  headers.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(body), { status, headers });
}

function tokenOf(req: Request): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE) return rest.join('=') || null;
  }
  return null;
}

/** Secure cookies need https; a front door (Caddy, Traefik) says if it was. */
function isHttps(req: Request): boolean {
  const forwarded = req.headers.get('x-forwarded-proto');
  if (forwarded) return forwarded.split(',')[0].trim() === 'https';
  return new URL(req.url).protocol === 'https:';
}

function sessionCookie(req: Request, token: string, maxAge: number): string {
  return [
    `${COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAge}`,
    ...(isHttps(req) ? ['Secure'] : []),
  ].join('; ');
}

/**
 * A request that changes something must come from this site's own pages.
 * The SameSite cookie already keeps other sites' requests logged out; this
 * refuses them outright.
 */
function fromOwnSite(req: Request): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
  const origin = req.headers.get('origin');
  if (!origin) return true;
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  try {
    return new URL(origin).host === host?.split(',')[0].trim();
  } catch {
    return false;
  }
}

// ---- the login API ----------------------------------------------------------

async function login(req: Request): Promise<Response> {
  const wait = limiter.wait();
  if (wait > 0)
    return json({ error: 'too-many', retryAfter: Math.ceil(wait / 1000) }, 429);
  let body: { username?: unknown; password?: unknown };
  try {
    const parsed: unknown = await req.json();
    // `null`, a number or a string is valid JSON but not a login.
    if (typeof parsed !== 'object' || parsed === null)
      return json({ error: 'bad-request' }, 400);
    body = parsed;
  } catch {
    return json({ error: 'bad-request' }, 400);
  }
  const username =
    typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!username || !password) return json({ error: 'missing' }, 400);

  if (!limiter.begin()) return json({ error: 'too-many', retryAfter: 1 }, 429);
  let result: Awaited<ReturnType<typeof checkLogin>>;
  try {
    result = await checkLogin(CALDAV_URL, username, password);
  } finally {
    limiter.end();
  }
  if (result === 'bad-login') {
    limiter.fail();
    return json({ error: 'bad-login' }, 401);
  }
  if (result !== 'ok') return json({ error: result }, 502);
  limiter.succeed();
  const token = sessions.create(username, password);
  return json({ username }, 200, {
    'Set-Cookie': sessionCookie(req, token, COOKIE_MAX_AGE_S),
  });
}

function session(req: Request): Response {
  const token = tokenOf(req);
  const current = sessions.get(token);
  if (!current) return json({ error: 'signed-out' }, 401);
  // Checking in renews the cookie, so "until you log out" holds for anyone
  // who opens the app at least once a year.
  return json({ username: current.username, server: CALDAV_SHOWN }, 200, {
    'Set-Cookie': sessionCookie(req, token!, COOKIE_MAX_AGE_S),
  });
}

function logout(req: Request, everywhere: boolean): Response {
  if (everywhere) {
    if (!sessions.get(tokenOf(req))) return json({ error: 'signed-out' }, 401);
    sessions.endAll();
  } else {
    sessions.end(tokenOf(req));
  }
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(req, '', 0) });
}

// ---- /dav/: through to the calendar ----------------------------------------

async function dav(req: Request, url: URL): Promise<Response> {
  const current = sessions.get(tokenOf(req));
  // No challenge header: a 401 here is for the app to read, not for the
  // browser to answer with a password box.
  if (!current) return json({ error: 'signed-out' }, 401);
  const target = upstreamUrl(CALDAV_URL, url.pathname, url.search);
  if (!target) return json({ error: 'bad-path' }, 400);
  let res: Response;
  try {
    res = await forward(
      req,
      target,
      basicAuth(current.username, current.password)
    );
  } catch {
    return json({ error: 'unreachable' }, 502);
  }
  // The calendar stopped accepting this login (the password changed): every
  // session holding it is over, and the app goes back to its login screen.
  if (res.status === 401) {
    await res.body?.cancel();
    sessions.endFor(current.username, current.password);
    return json({ error: 'signed-out' }, 401, {
      'Set-Cookie': sessionCookie(req, '', 0),
    });
  }
  // Calendar data is for this page now, not for a shared computer's cache.
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

// ---- the app's files ---------------------------------------------------------

const COMPRESSIBLE = /\.(js|html|css|json|svg|map|txt)$/;
const gzipped = new Map<string, Uint8Array<ArrayBuffer>>();

async function staticFile(req: Request, url: URL): Promise<Response> {
  if (!['GET', 'HEAD'].includes(req.method))
    return new Response(null, { status: 404 });
  const root = normalize(STATIC_DIR);
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return new Response(null, { status: 400 });
  }
  // No file name holds a NUL, and Bun.file throws on one.
  if (pathname.includes('\0')) return new Response(null, { status: 400 });
  // As the old Caddyfile's try_files: the file, the route's own .html (the
  // export writes one per route), else the app shell for client routing. A
  // path that names a file gets only that file.
  const candidates = mayServeShell(pathname)
    ? [
        pathname,
        `${pathname}.html`,
        join(pathname, 'index.html'),
        '/index.html',
      ]
    : [pathname];
  for (const candidate of candidates) {
    const path = normalize(join(root, candidate));
    if (path !== root && !path.startsWith(root + sep)) continue;
    const file = Bun.file(path);
    if (!(await file.exists())) continue;
    const headers = new Headers({
      'Content-Type': file.type,
      'Cache-Control': cacheControl(pathname, candidate),
    });
    if (
      COMPRESSIBLE.test(path) &&
      req.headers.get('accept-encoding')?.includes('gzip')
    ) {
      let body = gzipped.get(path);
      if (!body) {
        body = Bun.gzipSync(
          new Uint8Array(await file.arrayBuffer())
        ) as Uint8Array<ArrayBuffer>;
        gzipped.set(path, body);
      }
      headers.set('Content-Encoding', 'gzip');
      headers.set('Vary', 'Accept-Encoding');
      return new Response(req.method === 'HEAD' ? null : body, { headers });
    }
    return new Response(req.method === 'HEAD' ? null : file, { headers });
  }
  return new Response(null, { status: 404 });
}

/** Development: everything that is not login or calendar goes to Metro. */
async function devUpstream(req: Request, url: URL): Promise<Response> {
  const headers = new Headers(req.headers);
  headers.delete('accept-encoding');
  const res = await fetch(`${DEV_UPSTREAM}${url.pathname}${url.search}`, {
    method: req.method,
    headers,
    body: ['GET', 'HEAD'].includes(req.method)
      ? undefined
      : await req.arrayBuffer(),
    redirect: 'manual',
  });
  const out = new Headers(res.headers);
  out.delete('content-encoding');
  out.delete('content-length');
  return new Response(res.body, { status: res.status, headers: out });
}

// ---- routing -----------------------------------------------------------------

type Frame = string | Uint8Array<ArrayBuffer>;
type WsData = { path: string; upstream?: WebSocket; queue: Frame[] };

/** A calendar event is a few kilobytes; nothing here needs more than this. */
const MAX_BODY_BYTES = 16 * 1024 * 1024;

/** How long a connection may sit without a byte moving, in seconds. Bun's own
 *  default is 10, which cut a slow calendar answer (the forward waits up to 60 s,
 *  the login check 15 s) as an empty reply before the server could say 502. */
const IDLE_TIMEOUT_S = 90;

const server = Bun.serve<WsData>({
  port: PORT,
  maxRequestBodySize: MAX_BODY_BYTES,
  idleTimeout: IDLE_TIMEOUT_S,
  // Never Bun's development error page: it prints the server's source lines and
  // paths to whoever caused the error. (Bun turns it on unless NODE_ENV says
  // production, and the image did not set it.)
  development: false,
  error() {
    return withSecurity(json({ error: 'server-error' }, 500));
  },
  async fetch(req, srv) {
    const url = new URL(req.url);
    const path = url.pathname;

    // Metro's hot reload talks over a websocket; pass it through in dev.
    if (
      DEV_UPSTREAM &&
      req.headers.get('upgrade')?.toLowerCase() === 'websocket'
    ) {
      if (srv.upgrade(req, { data: { path: path + url.search, queue: [] } }))
        return undefined;
    }

    if (!fromOwnSite(req))
      return withSecurity(json({ error: 'cross-site' }, 403));

    if (path === '/healthz') return new Response('ok');
    if (path === '/api/session' && req.method === 'GET')
      return withSecurity(session(req));
    if (path === '/api/login' && req.method === 'POST')
      return withSecurity(await login(req));
    if (path === '/api/logout' && req.method === 'POST')
      return withSecurity(logout(req, false));
    if (path === '/api/logout-everywhere' && req.method === 'POST')
      return withSecurity(logout(req, true));
    if (path.startsWith('/api/'))
      return withSecurity(json({ error: 'not-found' }, 404));
    if (path === '/dav' || path.startsWith('/dav/'))
      return withSecurity(await dav(req, url));

    if (DEV_UPSTREAM) {
      try {
        return withSecurity(await devUpstream(req, url));
      } catch {
        return new Response('Metro is not running (bun run web:proxy)', {
          status: 502,
        });
      }
    }
    return withSecurity(await staticFile(req, url));
  },
  websocket: {
    open(ws) {
      const upstream = new WebSocket(
        `${DEV_UPSTREAM!.replace(/^http/, 'ws')}${ws.data.path}`
      );
      ws.data.upstream = upstream;
      upstream.binaryType = 'arraybuffer';
      upstream.onopen = () => {
        for (const message of ws.data.queue) upstream.send(message);
        ws.data.queue = [];
      };
      upstream.onmessage = (event) =>
        ws.send(
          typeof event.data === 'string'
            ? event.data
            : new Uint8Array(event.data)
        );
      upstream.onclose = () => ws.close();
      upstream.onerror = () => ws.close();
    },
    message(ws, message) {
      const frame: Frame =
        typeof message === 'string' ? message : new Uint8Array(message);
      const upstream = ws.data.upstream;
      if (upstream?.readyState === WebSocket.OPEN) upstream.send(frame);
      else ws.data.queue.push(frame);
    },
    close(ws) {
      ws.data.upstream?.close();
    },
  },
});

console.log(
  `hitome on http://localhost:${server.port} → calendar ${new URL(CALDAV_URL).host}` +
    (DEV_UPSTREAM ? ` (app from ${DEV_UPSTREAM})` : '')
);
