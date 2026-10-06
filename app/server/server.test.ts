import { afterAll, describe, expect, it } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { basicAuth, checkLogin, upstreamUrl } from './caldav';
import { createLimiter } from './limiter';
import { openSessions } from './sessions';

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'hitome-test-'));
  dirs.push(dir);
  return dir;
}
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe('sessions', () => {
  it('survive a restart', () => {
    const dir = tempDir();
    const token = openSessions(dir).create('sam', 'pw');
    expect(openSessions(dir).get(token)?.username).toBe('sam');
  });

  it('keep neither the token nor the password readable on disk', () => {
    const dir = tempDir();
    const token = openSessions(dir).create('sam', 'hunter2-password');
    const file = readFileSync(join(dir, 'sessions.enc')).toString('latin1');
    expect(file).not.toContain('hunter2-password');
    expect(file).not.toContain(token);
  });

  it('end one, or all', () => {
    const store = openSessions(tempDir());
    const a = store.create('sam', 'pw');
    const b = store.create('sam', 'pw');
    store.end(a);
    expect(store.get(a)).toBeNull();
    expect(store.get(b)).not.toBeNull();
    store.endAll();
    expect(store.count()).toBe(0);
  });

  it('end every session holding a login the calendar stopped accepting', () => {
    const store = openSessions(tempDir());
    store.create('sam', 'old');
    store.create('sam', 'old');
    const fresh = store.create('sam', 'new');
    store.endFor('sam', 'old');
    expect(store.count()).toBe(1);
    expect(store.get(fresh)).not.toBeNull();
  });

  it('ignore an unknown or missing token', () => {
    const store = openSessions(tempDir());
    expect(store.get('nope')).toBeNull();
    expect(store.get(null)).toBeNull();
  });
});

describe('limiter', () => {
  it('lets a few mistakes through, then makes each try wait longer', () => {
    let now = 0;
    const limiter = createLimiter(() => now);
    for (let i = 0; i < 4; i++) limiter.fail();
    expect(limiter.wait()).toBe(0);
    limiter.fail();
    expect(limiter.wait()).toBe(30_000);
    now += 30_000;
    limiter.fail();
    expect(limiter.wait()).toBe(60_000);
  });

  it('caps the wait and clears it on success', () => {
    let now = 0;
    const limiter = createLimiter(() => now);
    for (let i = 0; i < 20; i++) limiter.fail();
    expect(limiter.wait()).toBe(15 * 60_000);
    limiter.succeed();
    expect(limiter.wait()).toBe(0);
  });

  it('forgets old mistakes', () => {
    let now = 0;
    const limiter = createLimiter(() => now);
    for (let i = 0; i < 4; i++) limiter.fail();
    now += 16 * 60_000;
    limiter.fail();
    expect(limiter.wait()).toBe(0);
  });
});

describe('upstreamUrl', () => {
  it('maps /dav/ onto the calendar server', () => {
    expect(upstreamUrl('http://radicale:5232/', '/dav/sam/cal/', '?x=1')).toBe(
      'http://radicale:5232/sam/cal/?x=1'
    );
    expect(upstreamUrl('https://host/radicale/', '/dav/', '')).toBe(
      'https://host/radicale/'
    );
  });

  it('never leaves the calendar server’s base', () => {
    expect(
      upstreamUrl('https://host/radicale/', '/dav/../admin', '')
    ).toBeNull();
    expect(
      upstreamUrl('https://host/radicale/', '/dav//evil.example/', '')
    ).toBeNull();
  });
});

describe('checkLogin', () => {
  // A stand-in calendar server: one login works, anything else is refused.
  const fake = Bun.serve({
    port: 0,
    fetch(req) {
      const path = new URL(req.url).pathname;
      if (path === '/down/') return new Response(null, { status: 502 });
      if (path === '/web/') return new Response('<html>', { status: 200 });
      return req.headers.get('authorization') === basicAuth('sam', 'right')
        ? new Response('<multistatus/>', { status: 207 })
        : new Response(null, { status: 401 });
    },
  });
  afterAll(() => fake.stop());
  const base = `http://localhost:${fake.port}`;

  it('accepts the right login and refuses a wrong one', async () => {
    expect(await checkLogin(`${base}/`, 'sam', 'right')).toBe('ok');
    expect(await checkLogin(`${base}/`, 'sam', 'wrong')).toBe('bad-login');
  });

  it('tells a down server and a website apart from a wrong password', async () => {
    expect(await checkLogin(`${base}/down/`, 'sam', 'right')).toBe(
      'unreachable'
    );
    expect(await checkLogin(`${base}/web/`, 'sam', 'right')).toBe('not-caldav');
    expect(await checkLogin('http://localhost:1/', 'sam', 'right')).toBe(
      'unreachable'
    );
  });
});
