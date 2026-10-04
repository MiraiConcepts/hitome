// Where the calendar comes from, and whether it is ready — one per platform.
// The web reads a CalDAV server whose address lives in config (this file);
// Android reads the phone's calendar store, ready once calendar access is
// granted and some calendar is on the phone (source.android.ts).
import { ensureDavConfig, getDavStatus, useDavStatus } from './dav-store';

export type SourceStatus = 'loading' | 'configured' | 'unconfigured';

export const useSourceStatus: () => SourceStatus = useDavStatus;
export const getSourceStatus: () => SourceStatus = getDavStatus;

/** Load (once) and answer: is there a calendar to read? */
export async function ensureSource(): Promise<boolean> {
  return Boolean(await ensureDavConfig());
}

/** Look again (after a permission prompt, or back from another app). */
export async function recheckSource(): Promise<void> {}
