import { useSyncExternalStore } from 'react';

import { readSnapshot, writeSnapshot } from '@/utils/snapshot-cache';

/**
 * The alert a new timed event starts with — minutes before its start, or null
 * for none. Kept beside the default calendar in the snapshot cache (see
 * calendar-pref.ts for why that store); like it, best-effort: a lost
 * preference just means new events start with no alert.
 */
const KEY = 'prefs-default-alert';

let loaded = false;
let offset: number | null = null;
let loading: Promise<number | null> | null = null;
const listeners = new Set<() => void>();

export function ensureDefaultAlert(): Promise<number | null> {
  if (!loading) {
    loading = readSnapshot<number>(KEY).then((stored) => {
      offset = typeof stored === 'number' ? stored : null;
      loaded = true;
      for (const listener of listeners) listener();
      return offset;
    });
  }
  return loading;
}

export function setDefaultAlert(next: number | null): void {
  offset = next;
  loaded = true;
  writeSnapshot(KEY, next);
  for (const listener of listeners) listener();
}

/** The default as loaded so far — the editor reads it when it opens. */
export function getDefaultAlert(): number | null {
  return offset;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!loaded) ensureDefaultAlert();
  return () => {
    listeners.delete(listener);
  };
}

export function useDefaultAlert(): number | null {
  return useSyncExternalStore(subscribe, getDefaultAlert, getDefaultAlert);
}
