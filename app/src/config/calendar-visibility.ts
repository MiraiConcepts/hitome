import { useSyncExternalStore } from 'react';

import type { CalEvent } from '@/caldav/types';
import { readSnapshot, writeSnapshot } from '@/utils/snapshot-cache';

import { subscribeDavConfig } from './dav-store';

/**
 * Where each calendar's events appear. `shown` (the default) is the month grid
 * and the widget; `tray` keeps a calendar off both and lists its events in the
 * discover mode instead (a calendar a backend fills with things to do);
 * `hidden` keeps it off everything. Display only: every calendar's events are
 * still fetched and cached (so changing a role is instant) and their reminders
 * still ring.
 *
 * Kept in the snapshot cache like the default calendar (see calendar-pref.ts),
 * as two lists of calendar URLs, and cleared with it when the server changes
 * — a calendar URL means nothing on another account. The hidden list keeps
 * the key it had before the tray existed, so earlier choices carry over.
 */
export type CalendarRole = 'shown' | 'tray' | 'hidden';

export type CalendarRoles = {
  readonly hidden: readonly string[];
  readonly tray: readonly string[];
};

const HIDDEN_KEY = 'prefs-hidden-calendars';
const TRAY_KEY = 'prefs-tray-calendars';

const NONE: CalendarRoles = { hidden: [], tray: [] };

let loaded = false;
let roles: CalendarRoles = NONE;
let loading: Promise<CalendarRoles> | null = null;
const listeners = new Set<() => void>();

function publish(next: CalendarRoles) {
  roles = next;
  loaded = true;
  for (const listener of listeners) listener();
}

function urls(stored: unknown): string[] {
  return Array.isArray(stored)
    ? stored.filter((u): u is string => typeof u === 'string')
    : [];
}

export function ensureCalendarRoles(): Promise<CalendarRoles> {
  if (!loading) {
    loading = Promise.all([
      readSnapshot<string[]>(HIDDEN_KEY),
      readSnapshot<string[]>(TRAY_KEY),
    ]).then(([hidden, tray]) => {
      publish({ hidden: urls(hidden), tray: urls(tray) });
      return roles;
    });
  }
  // The load runs once, but its promise holds the roles as first read: answer
  // with the current ones, or a change made since (setCalendarRole) would not
  // reach the widget's fetch until the app restarted.
  return loading.then(() => roles);
}

export function setCalendarRole(url: string, role: CalendarRole): void {
  // Before the stored roles are in, both lists would be written from empty
  // ones, wiping every other calendar's choice: wait for them.
  if (!loaded) {
    void ensureCalendarRoles().then(() => setCalendarRole(url, role));
    return;
  }
  const without = (list: readonly string[]) => list.filter((u) => u !== url);
  const next: CalendarRoles = {
    hidden:
      role === 'hidden'
        ? [...without(roles.hidden), url]
        : without(roles.hidden),
    tray: role === 'tray' ? [...without(roles.tray), url] : without(roles.tray),
  };
  writeSnapshot(HIDDEN_KEY, next.hidden);
  writeSnapshot(TRAY_KEY, next.tray);
  publish(next);
}

/** The role of the calendar that holds `url` — a calendar's own URL or one
 *  of its events' object URLs. */
export function roleOf(url: string, current: CalendarRoles): CalendarRole {
  if (current.hidden.some((c) => url.startsWith(c))) return 'hidden';
  if (current.tray.some((c) => url.startsWith(c))) return 'tray';
  return 'shown';
}

/**
 * Calendars in the order Settings lists them: the one new events go into
 * first, then the rest of the shown ones, then discover, then hidden, A to Z
 * within each (by name, as people read them; the server's own order was
 * arbitrary). Re-sorted as roles change, so a row moves to its group.
 */
export function orderCalendars<T extends { url: string; name: string }>(
  calendars: readonly T[],
  current: CalendarRoles,
  newEventsUrl: string | undefined
): T[] {
  const rank = (c: T) =>
    c.url === newEventsUrl
      ? 0
      : { shown: 1, tray: 2, hidden: 3 }[roleOf(c.url, current)];
  return [...calendars].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  );
}

/**
 * True when an event is drawn on the month grid and the widget. Shown
 * calendars: every event but a cancelled one. Tray calendars: only events
 * you are going to (marked busy), and a cancelled one of those, crossed out,
 * until its day has passed. Hidden calendars: nothing.
 */
export function onCalendar(
  event: Pick<CalEvent, 'url' | 'end' | 'free' | 'cancelled'>,
  current: CalendarRoles,
  now = new Date()
): boolean {
  switch (roleOf(event.url, current)) {
    case 'shown':
      return !event.cancelled;
    case 'tray': {
      if (event.free) return false;
      if (!event.cancelled) return true;
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      // End is exclusive: an all-day event ends at the next midnight, and
      // one ending at today's has already passed.
      return event.end > today;
    }
    case 'hidden':
      return false;
  }
}

function getRoles(): CalendarRoles {
  return roles;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!loaded) ensureCalendarRoles();
  return () => {
    listeners.delete(listener);
  };
}

export function useCalendarRoles(): CalendarRoles {
  return useSyncExternalStore(subscribe, getRoles, getRoles);
}

subscribeDavConfig(() => {
  loading = null;
  publish(NONE);
  loaded = false;
});
