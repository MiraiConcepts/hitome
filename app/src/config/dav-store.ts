import { useSyncExternalStore } from 'react';

import { clearSnapshots } from '@/utils/snapshot-cache';

import type { DavConfig, DavStatus } from './dav-config';
import {
  clearLastConfig,
  clearStoredConfig,
  readLastConfig,
  readStoredConfig,
  writeLastConfig,
  writeStoredConfig,
} from './dav-storage';

/**
 * The live CalDAV connection, and the one place that knows whether the app is
 * configured at all.
 *
 * Previously this was a module constant built from `process.env.EXPO_PUBLIC_*`,
 * which Metro inlines at bundle time — unchangeable at runtime by construction,
 * which is why the URL had to be baked into the APK. Now it is read from
 * storage at launch, so there is a third state the old boolean could not
 * express: 'loading', before the read lands. Everything that fetches has to
 * wait for it rather than conclude "not configured" from a null.
 *
 * Hand-rolled rather than a state library, following the footer store in
 * event-editor-sheet.tsx: the headless widget and alarm entry points have no
 * React tree, so the store has to be readable without one.
 */

let config: DavConfig | null = null;
/** The connection last disconnected, if any — the setup form's starting
 *  values, so signing out and back in is not a retype. Loaded alongside the
 *  live config, so it is ready before the setup screen can render. */
let last: DavConfig | null = null;
let status: DavStatus = 'loading';
let loading: Promise<DavConfig | null> | null = null;

const listeners = new Set<() => void>();
/** Notified only on a real change — not on the first load. */
const changeListeners = new Set<() => void>();
let published = false;

function publish(next: DavConfig | null): void {
  config = next;
  status = next ? 'configured' : 'unconfigured';
  // ensureDavConfig() hands back this promise forever, so it has to carry the
  // current value — not the one read at launch. Without this a save left every
  // async caller (the client, the widget, the alarm runner) still awaiting the
  // null from startup, and the calendar reported "no server configured" while
  // the settings screen showed the server it had just connected to.
  loading = Promise.resolve(next);
  // The initial load is not a change: it is the first time anyone has seen the
  // value. Telling the client to drop its connection here would null a cache
  // entry for a login still in flight, costing a second one.
  const changed = published;
  published = true;
  for (const listener of listeners) listener();
  if (changed) for (const listener of changeListeners) listener();
}

/**
 * Read the stored config, once per JS context. Every entry point that touches
 * the network awaits this first — the app's root gate, the widget's headless
 * task, and the alarm reconciler.
 */
export function ensureDavConfig(): Promise<DavConfig | null> {
  if (!loading) {
    loading = Promise.all([
      readStoredConfig().catch(() => null),
      readLastConfig().catch(() => null),
    ]).then(([stored, previous]) => {
      last = previous;
      publish(stored);
      return stored;
    });
  }
  return loading;
}

/** The connection last disconnected on this device, or null. */
export function getLastDavConfig(): DavConfig | null {
  return last;
}

/** The loaded config, or null while loading or unconfigured — check status. */
export function getDavConfig(): DavConfig | null {
  return config;
}

export function getDavStatus(): DavStatus {
  return status;
}

/**
 * Swap the connection. The cached tsdav client captured the old server's URL
 * and credentials at construction, so it has to go with it — resetClient()
 * has existed for exactly this since the CalDAV work landed, with nothing
 * calling it until now.
 */
export async function saveDavConfig(next: DavConfig): Promise<void> {
  const changed = next.url !== config?.url || next.username !== config.username;
  await writeStoredConfig(next);
  // Only when the account actually moved — a password correction against the
  // same server should keep the cache it can still use.
  if (changed) await clearSnapshots();
  // Connected again: the remembered copy has done its job, and keeping a
  // second copy of the password around serves nothing.
  if (last) {
    await clearLastConfig();
    last = null;
  }
  publish(next);
}

/**
 * Disconnect. The calendar cache goes, but the address and login are kept
 * (in the same keystore, under their own key) to prefill the setup screen —
 * signing out to try something and back in should not mean retyping them.
 */
export async function clearDavConfig(): Promise<void> {
  if (config) {
    await writeLastConfig(config);
    last = config;
  }
  await clearStoredConfig();
  await clearSnapshots();
  publish(null);
}

/**
 * Sign out and erase: the connection, the remembered copy of it, and every
 * cached calendar, preference and widget snapshot on this device. What is
 * left is a fresh install's state.
 */
export async function eraseDavConfig(): Promise<void> {
  await clearStoredConfig();
  await clearLastConfig();
  last = null;
  await clearSnapshots();
  publish(null);
}

/**
 * Notified when the connection actually changes — saved, or disconnected —
 * and never for the initial load. caldav/client subscribes to drop its cached
 * connection, and calendar-pref to drop a choice that belonged to the old
 * account. The dependency runs that way round (they import the store, not the
 * reverse) so nothing forms a cycle.
 */
export function subscribeDavConfig(listener: () => void): () => void {
  changeListeners.add(listener);
  return () => {
    changeListeners.delete(listener);
  };
}

/** Every publish, initial load included — what React renders from. */
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useDavStatus(): DavStatus {
  return useSyncExternalStore(subscribe, getDavStatus, getDavStatus);
}

export function useDavConfig(): DavConfig | null {
  return useSyncExternalStore(subscribe, getDavConfig, getDavConfig);
}
