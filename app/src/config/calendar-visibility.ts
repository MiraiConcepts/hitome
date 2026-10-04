import { useSyncExternalStore } from 'react';

import { readSnapshot, writeSnapshot } from '@/utils/snapshot-cache';

import { subscribeDavConfig } from './dav-store';

/**
 * Calendars kept off the month grid and the widget. Display only: their
 * events are still fetched and cached (so showing one again is instant) and
 * their reminders still ring. Kept in the snapshot cache like the default
 * calendar (see calendar-pref.ts), and cleared with it when the server changes
 * — a calendar URL means nothing on another account.
 */
const KEY = 'prefs-hidden-calendars';

let loaded = false;
let hidden: readonly string[] = [];
let loading: Promise<readonly string[]> | null = null;
const listeners = new Set<() => void>();

function publish(next: readonly string[]) {
  hidden = next;
  loaded = true;
  for (const listener of listeners) listener();
}

export function ensureHiddenCalendars(): Promise<readonly string[]> {
  if (!loading) {
    loading = readSnapshot<string[]>(KEY).then((stored) => {
      publish(
        Array.isArray(stored)
          ? stored.filter((u): u is string => typeof u === 'string')
          : []
      );
      return hidden;
    });
  }
  return loading;
}

export function setCalendarHidden(url: string, hide: boolean): void {
  const next = hide
    ? [...hidden.filter((u) => u !== url), url]
    : hidden.filter((u) => u !== url);
  writeSnapshot(KEY, next);
  publish(next);
}

/** True when an event (by its object URL) belongs to a hidden calendar. */
export function inHiddenCalendar(
  eventUrl: string,
  hiddenUrls: readonly string[]
): boolean {
  return hiddenUrls.some((url) => eventUrl.startsWith(url));
}

function getHidden(): readonly string[] {
  return hidden;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!loaded) ensureHiddenCalendars();
  return () => {
    listeners.delete(listener);
  };
}

export function useHiddenCalendars(): readonly string[] {
  return useSyncExternalStore(subscribe, getHidden, getHidden);
}

subscribeDavConfig(() => {
  loading = null;
  publish([]);
  loaded = false;
});
