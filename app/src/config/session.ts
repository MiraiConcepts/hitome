// The web app's login, as hitome's server sees it (app/server). The browser
// holds no credential: the server keeps the calendar login and gives the
// browser an httpOnly cookie that page code cannot read. This module only
// asks the server about it, and logs in and out. Android has no use for it:
// DAVx⁵ holds the login there (source.android.ts).
import { useSyncExternalStore } from 'react';

import { clearSnapshots } from '@/utils/snapshot-cache';

export type SessionStatus = 'loading' | 'signed-in' | 'signed-out';

type State = {
  status: SessionStatus;
  username: string | null;
  /** The calendar server's address, for Settings. */
  server: string | null;
  /** Why the login screen is up again, when it was not the person's choice. */
  notice: string | null;
};

let state: State = {
  status: 'loading',
  username: null,
  server: null,
  notice: null,
};
let loading: Promise<boolean> | null = null;
const listeners = new Set<() => void>();
const changeListeners = new Set<() => void>();

function publish(next: Partial<State>): void {
  const wasSignedIn = state.status === 'signed-in';
  state = { ...state, ...next };
  for (const listener of listeners) listener();
  // Signing out (or in as someone new) has to drop what the old login
  // cached: the CalDAV client and its calendar list.
  if (wasSignedIn !== (state.status === 'signed-in'))
    for (const listener of changeListeners) listener();
}

/** Ask the server whether this browser is logged in. */
async function readSession(): Promise<boolean> {
  try {
    const res = await fetch('/api/session', { credentials: 'same-origin' });
    if (res.ok) {
      const body = (await res.json()) as { username: string; server: string };
      publish({
        status: 'signed-in',
        username: body.username,
        server: body.server,
      });
      return true;
    }
  } catch {
    // The page came from this server a moment ago, so this is a blip; the
    // login screen is the safe answer and a retry is one tap away.
  }
  publish({ status: 'signed-out', username: null });
  return false;
}

/** Once per page load: is anyone logged in? */
export function ensureSession(): Promise<boolean> {
  if (!loading) loading = readSession();
  return loading;
}

/**
 * The calendar refused a request. If the server has ended the session (the
 * password changed, or Log out everywhere ran elsewhere), go back to the
 * login screen and say why.
 */
export async function recheckSession(): Promise<void> {
  const before = state.status;
  loading = readSession();
  if ((await loading) || before !== 'signed-in') return;
  await clearSnapshots();
  publish({
    notice:
      'Your login stopped working. It may have changed, or you logged out on another device. Log in again.',
  });
}

export type LoginFailure =
  | 'bad-login'
  | 'too-many'
  | 'unreachable'
  | 'not-caldav'
  | 'missing'
  | 'unknown';

export type LoginResult =
  | { ok: true }
  | { ok: false; failure: LoginFailure; retryAfter?: number };

export async function logIn(
  username: string,
  password: string
): Promise<LoginResult> {
  let res: Response;
  try {
    res = await fetch('/api/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
  } catch {
    return { ok: false, failure: 'unreachable' };
  }
  if (res.ok) {
    // Whatever an earlier login cached is not this one's to show.
    await clearSnapshots();
    loading = readSession();
    publish({ notice: null });
    return (await loading) ? { ok: true } : { ok: false, failure: 'unknown' };
  }
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    retryAfter?: number;
  };
  const known: LoginFailure[] = [
    'bad-login',
    'too-many',
    'unreachable',
    'not-caldav',
    'missing',
  ];
  const failure = known.includes(body.error as LoginFailure)
    ? (body.error as LoginFailure)
    : 'unknown';
  return { ok: false, failure, retryAfter: body.retryAfter };
}

/** What the login screen says about a failed attempt. */
export function loginFailureMessage(result: LoginResult): string | null {
  if (result.ok) return null;
  switch (result.failure) {
    case 'bad-login':
      return 'That username and password weren’t accepted.';
    case 'missing':
      return 'Enter your username and password.';
    case 'too-many': {
      const seconds = result.retryAfter ?? 30;
      const wait =
        seconds >= 90
          ? `${Math.ceil(seconds / 60)} minutes`
          : `${seconds} seconds`;
      return `Too many tries. Wait ${wait}, then try again.`;
    }
    case 'unreachable':
      return 'Can’t reach your calendar server right now. Try again in a moment.';
    case 'not-caldav':
      return 'The calendar server address set for this copy of hitome doesn’t answer like a calendar server. Check CALDAV_URL.';
    default:
      return 'Couldn’t log in. Try again.';
  }
}

/** Log out this browser, or every browser logged in to this copy. */
export async function logOut(everywhere = false): Promise<void> {
  try {
    await fetch(everywhere ? '/api/logout-everywhere' : '/api/logout', {
      method: 'POST',
      credentials: 'same-origin',
    });
  } finally {
    // The events this browser cached go with the login that fetched them.
    await clearSnapshots();
    loading = Promise.resolve(false);
    publish({ status: 'signed-out', username: null, notice: null });
  }
}

/** Notified whenever the signed-in state flips (the first read included,
 *  which is harmless: nothing is cached yet). */
export function subscribeSession(listener: () => void): () => void {
  changeListeners.add(listener);
  return () => {
    changeListeners.delete(listener);
  };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getState = () => state;

export function useSession(): State {
  return useSyncExternalStore(subscribe, getState, getState);
}

export function getSessionStatus(): SessionStatus {
  return state.status;
}
