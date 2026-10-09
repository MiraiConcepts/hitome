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
});
