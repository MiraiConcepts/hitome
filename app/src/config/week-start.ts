import { useSyncExternalStore } from 'react';

import { setFirstDayOfWeek } from '@/utils/calendar-grid';

import { readPref, writePref } from './device-prefs';

/** Which day weeks start on: a fixed day, or whatever the phone says. */
export type WeekStart = 'monday' | 'sunday' | 'phone';

const KEY = 'week-start';

/** Monday unless chosen otherwise — hitome's own convention since the grid's
 *  redesign, whatever a phone's locale happens to default to. */
let choice: WeekStart = 'monday';
let phoneFirstDay = 1;
const listeners = new Set<() => void>();

function apply(): void {
  setFirstDayOfWeek(
    choice === 'monday' ? 1 : choice === 'sunday' ? 0 : phoneFirstDay
  );
}

/** Launch: the phone's own first day (from utils/region.ts) and the stored
 *  choice, read synchronously so the grid's first frame is already right. */
export function initWeekStart(phoneDay: number): void {
  phoneFirstDay = phoneDay;
  const stored = readPref(KEY);
  if (stored === 'monday' || stored === 'sunday' || stored === 'phone')
    choice = stored;
  apply();
}

export function setWeekStart(next: WeekStart): void {
  choice = next;
  writePref(KEY, next);
  apply();
  for (const listener of listeners) listener();
}

/** The phone's own first day, for the setting's "Match phone" label. */
export function getPhoneFirstDay(): number {
  return phoneFirstDay;
}

function get(): WeekStart {
  return choice;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useWeekStart(): WeekStart {
  return useSyncExternalStore(subscribe, get, get);
}
