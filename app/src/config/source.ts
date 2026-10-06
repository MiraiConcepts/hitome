// Where the calendar comes from, and whether it is ready — one per platform.
// The web reads CalDAV through hitome's own server (app/server), which holds
// the calendar login; it is ready once this browser is logged in there
// (this file). Android reads the phone's calendar store, ready once calendar
// access is granted and some calendar is on the phone (source.android.ts).
import { ensureDavConfig } from './dav-store';
import {
  ensureSession,
  getSessionStatus,
  recheckSession,
  useSession,
} from './session';

export type SourceStatus = 'loading' | 'configured' | 'unconfigured';

function toSource(status: ReturnType<typeof getSessionStatus>): SourceStatus {
  if (status === 'loading') return 'loading';
  return status === 'signed-in' ? 'configured' : 'unconfigured';
}

export function useSourceStatus(): SourceStatus {
  return toSource(useSession().status);
}

export function getSourceStatus(): SourceStatus {
  return toSource(getSessionStatus());
}

/** Load (once) and answer: is there a calendar to read? */
export async function ensureSource(): Promise<boolean> {
  // The endpoint (/dav/ on this page's own address) and the login are
  // separate questions; the calendar needs both answered.
  const [config, signedIn] = await Promise.all([
    ensureDavConfig(),
    ensureSession(),
  ]);
  return Boolean(config) && signedIn;
}

/** Look again (after the calendar refused a request). */
export async function recheckSource(): Promise<void> {
  await recheckSession();
}
