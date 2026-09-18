import { useSyncExternalStore } from 'react';

import { clearSnapshots } from '@/utils/snapshot-cache';

import type { DavConfig, DavStatus } from './dav-config';
import {
  clearStoredConfig,
  readStoredConfig,
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
let status: DavStatus = 'loading';
let loading: Promise<DavConfig | null> | null = null;

const listeners = new Set<() => void>();

function publish(next: DavConfig | null): void {
  config = next;
  status = next ? 'configured' : 'unconfigured';
  for (const listener of listeners) listener();
}

/**
 * Read the stored config, once per JS context. Every entry point that touches
 * the network awaits this first — the app's root gate, the widget's headless
 * task, and the alarm reconciler.
 */
export function ensureDavConfig(): Promise<DavConfig | null> {
  if (!loading) {
    loading = readStoredConfig()
      .catch(() => null)
      .then((stored) => {
        publish(stored);
        return stored;
      });
  }
  return loading;
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
  publish(next);
}

export async function clearDavConfig(): Promise<void> {
  await clearStoredConfig();
  await clearSnapshots();
  publish(null);
}

/**
 * Notified on every change, including the initial load. caldav/client
 * subscribes to drop its cached connection — the dependency runs that way
 * round (client imports the store, not the reverse) so the two do not form a
 * cycle.
 */
export function subscribeDavConfig(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const subscribe = subscribeDavConfig;

export function useDavStatus(): DavStatus {
  return useSyncExternalStore(subscribe, getDavStatus, getDavStatus);
}

export function useDavConfig(): DavConfig | null {
  return useSyncExternalStore(subscribe, getDavConfig, getDavConfig);
}
