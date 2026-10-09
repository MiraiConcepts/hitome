import { logOut, recheckSession } from '@/config/session';

import type { DesiredAlarm } from './occurrences';
import {
  cancelAllReminders,
  listScheduledAlarmIds,
  scheduleAlarm,
} from './scheduler.web';

// A reminder queued in the tab belongs to the login that fetched it: once
// that login ends, it must not ring over the login screen.

const realFetch = globalThis.fetch;

/** hitome's server, answering /api/session as `signedIn` says. */
function server(signedIn: () => boolean) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/api/session')
      return signedIn()
        ? new Response(JSON.stringify({ username: 'u', server: 's' }))
        : new Response('{}', { status: 401 });
    return new Response(null, { status: 204 });
  }) as typeof fetch;
}

const alarm: DesiredAlarm = {
  id: 'alarm:e1:1',
  fireDate: new Date(Date.now() + 3_600_000),
  title: 'Dentist',
  body: '10:00, Main Street',
  day: '2026-10-09',
  event: 'e1',
};

afterEach(async () => {
  globalThis.fetch = realFetch;
  await cancelAllReminders();
});

describe('web reminders when the session ends', () => {
  it('are dropped on Log out', async () => {
    let signedIn = true;
    server(() => signedIn);
    await recheckSession();
    await scheduleAlarm(alarm);
    signedIn = false;
    await logOut();
    expect(await listScheduledAlarmIds()).toEqual([]);
  });

  it('are dropped when the server has ended the session', async () => {
    let signedIn = true;
    server(() => signedIn);
    await recheckSession();
    await scheduleAlarm(alarm);
    signedIn = false;
    await recheckSession();
    expect(await listScheduledAlarmIds()).toEqual([]);
  });
});
