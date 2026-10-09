import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The real server in a child process, against a calendar address nothing
// listens on (these requests never get that far): what a stranger can make it
// answer. Errors it did not plan for used to come back as Bun's development
// page, with the server's source lines and paths in it.
const dir = mkdtempSync(join(tmpdir(), 'hitome-http-'));
const port = 20000 + Math.floor(Math.random() * 20000);
const base = `http://127.0.0.1:${port}`;
let child: ReturnType<typeof Bun.spawn>;

beforeAll(async () => {
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>app</title>');
  writeFileSync(join(dir, 'about.html'), '<!doctype html><title>about</title>');
  writeFileSync(join(dir, 'version.json'), '{"version":"1"}');
  child = Bun.spawn(['bun', join(import.meta.dir, 'index.ts')], {
    env: {
      PATH: process.env.PATH ?? '',
      CALDAV_URL: 'http://127.0.0.1:9/',
      PORT: String(port),
      DATA_DIR: join(dir, 'data'),
      STATIC_DIR: dir,
    },
    stdout: 'ignore',
    stderr: 'ignore',
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${base}/healthz`)).ok) return;
    } catch {
      /* not up yet */
    }
    await Bun.sleep(50);
  }
  throw new Error('the server did not start');
});

afterAll(() => {
  child?.kill();
  rmSync(dir, { recursive: true, force: true });
});

// A browser sends the page's own origin on a POST.
const post = (path: string, body: string) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { Origin: base, 'Content-Type': 'application/json' },
    body,
  });

describe('server answers to bad requests', () => {
  it('refuses a login whose JSON is not an object, without an error page', async () => {
    for (const body of ['null', '42', '"sam"', '[]']) {
      const res = await post('/api/login', body);
      expect([400]).toContain(res.status);
      const text = await res.text();
      expect(text.length).toBeLessThan(200);
      expect(text).not.toContain('index.ts');
    }
  });

  it('refuses a path with a NUL in it, without an error page', async () => {
    const res = await fetch(`${base}/%00`);
    expect(res.status).toBe(400);
    expect((await res.text()).length).toBeLessThan(200);
  });

  it('serves the app shell for a client route', async () => {
    const res = await fetch(`${base}/settings`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<title>app</title>');
  });

  it("serves a route's own page and a file that is there", async () => {
    const page = await fetch(`${base}/about`);
    expect(await page.text()).toContain('<title>about</title>');
    const file = await fetch(`${base}/version.json`);
    expect(file.status).toBe(200);
    expect(await file.text()).toContain('"version"');
  });

  it('serves the app shell for a client route the export has no page for', async () => {
    const res = await fetch(`${base}/somewhere/deep`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<title>app</title>');
  });

  // After a release a browser holding the old page asks for the old bundle; the
  // shell in its place would run as JavaScript and fail as a syntax error.
  it('answers 404, not the shell, for a missing file', async () => {
    for (const path of [
      '/_expo/static/js/web/entry-abc.js',
      '/x.js',
      '/styles.css',
      '/logo.png',
      '/data.json',
      '/entry.js.map',
      '/favicon.ico',
      '/robots.txt',
      '/.well-known/caldav',
      '/.well-known/carddav',
    ]) {
      const res = await fetch(`${base}${path}`);
      expect({ path, status: res.status }).toEqual({ path, status: 404 });
      expect(await res.text()).toBe('');
    }
  });
});
