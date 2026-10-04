import { useSyncExternalStore } from 'react';

import { readSnapshot, writeSnapshot } from '@/utils/snapshot-cache';

import { subscribeDavConfig } from './dav-store';

/**
 * Which discovered calendar new events are created into.
 *
 * Kept in the ordinary snapshot cache rather than the keystore: it is a
 * preference, not a secret, and it is the one store that works on both
 * platforms (web derives its connection and so cannot write to the keystore at
 * all). It is also then cleared along with everything else when the server
 * changes, which is right — a calendar URL from the old account means nothing
 * on the new one. The cost is the cache's own best-effort contract: a lost
 * preference falls back to discovery order rather than failing.
 */
const KEY = 'prefs-default-calendar';

let loaded = false;
let preferred: string | null = null;
let loading: Promise<string | null> | null = null;
const listeners = new Set<() => void>();

export function ensureDefaultCalendar(): Promise<string | null> {
  if (!loading) {
    loading = readSnapshot<string>(KEY).then((stored) => {
      preferred = typeof stored === 'string' && stored ? stored : null;
      loaded = true;
      for (const listener of listeners) listener();
      return preferred;
    });
  }
  return loading;
}

export function setDefaultCalendar(url: string): void {
  preferred = url;
  loaded = true;
  writeSnapshot(KEY, url);
  for (const listener of listeners) listener();
}

/** The chosen calendar's URL, or null — loaded already, or not chosen. */
function snapshot(): string | null {
  return preferred;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // The settings list needs the stored value; nothing else reads it through
  // React, so the read is kicked from here rather than an effect.
  if (!loaded) ensureDefaultCalendar();
  return () => {
    listeners.delete(listener);
  };
}

export function useDefaultCalendar(): string | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

// A calendar URL belongs to the account it was discovered from, and changing
// the server wipes the snapshot it lives in — so the in-memory copy has to go
// with it, or a stale choice would outlive the server it pointed at.
subscribeDavConfig(() => {
  loaded = false;
  preferred = null;
  loading = null;
  for (const listener of listeners) listener();
});
