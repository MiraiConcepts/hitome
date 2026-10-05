// Android: the phone's calendar store (see source.ts). Ready means calendar
// access is granted and at least one calendar is on the phone — DAVx⁵,
// Google or any other account's.
import { useSyncExternalStore } from 'react';
import { AppState, PermissionsAndroid } from 'react-native';

import { clearLastConfig, clearStoredConfig } from '@/config/dav-storage';
import {
  isStoreDisconnected,
  setStoreDisconnected,
} from '@/config/store-connection';
import { CalendarStore } from '../../modules/calendar-store';
import { listCalendars } from '@/store/events';

export type SourceStatus = 'loading' | 'configured' | 'unconfigured';
/** Why it is not ready, for the first-run screen. */
export type SourceProblem = 'permission' | 'no-calendars' | null;

const READ = PermissionsAndroid.PERMISSIONS.READ_CALENDAR;
const WRITE = PermissionsAndroid.PERMISSIONS.WRITE_CALENDAR;

let status: SourceStatus = 'loading';
let problem: SourceProblem = null;
let checking: Promise<boolean> | null = null;
const listeners = new Set<() => void>();

function publish(next: SourceStatus, why: SourceProblem) {
  if (next === status && why === problem) return;
  status = next;
  problem = why;
  for (const listener of listeners) listener();
}

async function check(): Promise<boolean> {
  // Disconnected in Settings reads as not yet allowed: the first-run screen,
  // whose Allow connects again (see requestCalendarAccess).
  if (isStoreDisconnected()) {
    publish('unconfigured', 'permission');
    return false;
  }
  try {
    const granted =
      (await PermissionsAndroid.check(READ)) &&
      (await PermissionsAndroid.check(WRITE));
    if (!granted) {
      publish('unconfigured', 'permission');
      return false;
    }
    const calendars = await listCalendars();
    if (calendars.length === 0) {
      publish('unconfigured', 'no-calendars');
      return false;
    }
    // Access granted: the store watcher (refused before) can attach now.
    CalendarStore?.watch().catch(() => {});
    publish('configured', null);
    return true;
  } catch {
    publish('unconfigured', 'permission');
    return false;
  }
}

export function ensureSource(): Promise<boolean> {
  if (!checking) {
    // hitome no longer holds a server login on Android — DAVx⁵ does. A login
    // saved by an earlier version is erased, not left in the keystore.
    clearStoredConfig().catch(() => {});
    clearLastConfig().catch(() => {});
    checking = check();
  }
  return checking;
}

export function recheckSource(): Promise<boolean> {
  checking = check();
  return checking;
}

/** Ask for calendar access (the system prompt), then look again; true when
 *  hitome can now read a calendar. */
export async function requestCalendarAccess(): Promise<boolean> {
  setStoreDisconnected(false);
  await PermissionsAndroid.requestMultiple([READ, WRITE]);
  return recheckSource();
}

export function getSourceStatus(): SourceStatus {
  return status;
}
function getProblem(): SourceProblem {
  return problem;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSourceStatus(): SourceStatus {
  return useSyncExternalStore(subscribe, getSourceStatus, getSourceStatus);
}
export function useSourceProblem(): SourceProblem {
  return useSyncExternalStore(subscribe, getProblem, getProblem);
}

// Back from Settings or DAVx⁵ (access granted, an account added): look again.
AppState.addEventListener('change', (state) => {
  if (state === 'active' && status !== 'loading') recheckSource();
});
