import { DAVClient } from 'tsdav';

import { classifyConnectError, writeFailureMessage } from '@/config/dav-config';

import { timedFetch } from '../client';

// A proxy that takes the request and never answers: every CalDAV request
// gives up, and says so the way an unreachable server does.

type Fetch = typeof fetch;

/** A fetch that never answers, noting the signal each request was given. */
function hanging() {
  const signals: AbortSignal[] = [];
  const fetchImpl = ((_: unknown, init?: RequestInit) => {
    if (init?.signal) signals.push(init.signal);
    return new Promise<Response>(() => {});
  }) as Fetch;
  return { fetchImpl, signals };
}

describe('timedFetch', () => {
  it('gives up on a request that never answers, and aborts it', async () => {
    const { fetchImpl, signals } = hanging();
    const err = await timedFetch(
      fetchImpl,
      20,
      20
    )('https://dav.test/')
      .then(() => null)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(signals).toHaveLength(1);
    expect(signals[0].aborted).toBe(true);
    expect(classifyConnectError(err)).toBe('unreachable');
    expect(writeFailureMessage(err, 'save')).toBe(
      'Not saved. Can’t reach your calendar server. Your changes are still here; try again when you’re connected.'
    );
  });

  it('gives writes and reads their own time', async () => {
    const { fetchImpl } = hanging();
    const timed = timedFetch(fetchImpl, 200, 20);
    await expect(
      timed('https://dav.test/a.ics', { method: 'PUT' })
    ).rejects.toThrow(/timed out/);
    const read = timed('https://dav.test/', { method: 'REPORT' });
    const raced = await Promise.race([
      read.then(
        () => 'settled',
        () => 'settled'
      ),
      new Promise((resolve) => setTimeout(() => resolve('waiting'), 60)),
    ]);
    expect(raced).toBe('waiting');
    await expect(read).rejects.toThrow(/timed out/);
  });

  it('passes an answer through', async () => {
    const ok = new Response('ok', { status: 207 });
    const res = await timedFetch(
      (async () => ok) as Fetch,
      20,
      20
    )('https://dav.test/');
    expect(res).toBe(ok);
  });

  it('is the fetch tsdav sends a write through', async () => {
    const { fetchImpl, signals } = hanging();
    const client = new DAVClient({
      serverUrl: 'https://dav.test/',
      credentials: {},
      authMethod: 'Custom',
      authFunction: async () => ({}),
      fetch: timedFetch(fetchImpl, 20, 20),
    });
    await expect(
      client.updateCalendarObject({
        calendarObject: {
          url: 'https://dav.test/cal/a.ics',
          data: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR',
          etag: '"1"',
        },
      })
    ).rejects.toThrow(/timed out/);
    expect(signals).toHaveLength(1);
  });
});
