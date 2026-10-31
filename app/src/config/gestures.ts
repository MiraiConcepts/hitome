import { useSyncExternalStore } from 'react';

import { readPref, writePref } from './device-prefs';

/**
 * What the month grid's taps and holds do (Settings › Gestures), per device.
 * The defaults are how hitome has always behaved. Discover mode keeps its own
 * gestures whatever these say: a tap there opens the day list, a hold an
 * event's page.
 */
export type Gestures = {
  /** A tap on a day with nothing on it. */
  emptyDayTap: 'create' | 'day' | 'nothing';
  /** A tap on an event. A day with more than it can show opens its list
   *  whatever this says: the hidden events are only reachable there. */
  eventTap: 'open' | 'day';
  /** A hold on a day, over its events too. */
  dayHold: 'create' | 'day';
  /** A tap on the month name; a hold does the other one. */
  monthTap: 'today' | 'picker';
};

export const DEFAULT_GESTURES: Gestures = {
  emptyDayTap: 'create',
  eventTap: 'open',
  dayHold: 'create',
  monthTap: 'today',
};

const KEY = 'gestures';

const CHOICES: { [K in keyof Gestures]: readonly Gestures[K][] } = {
  emptyDayTap: ['create', 'day', 'nothing'],
  eventTap: ['open', 'day'],
  dayHold: ['create', 'day'],
  monthTap: ['today', 'picker'],
};

/** The stored choices, each one checked: an unknown or missing value falls
 *  back to its default rather than to nothing. */
function read(): Gestures {
  let stored: Partial<Record<keyof Gestures, unknown>> = {};
  try {
    stored = JSON.parse(readPref(KEY) ?? '{}') ?? {};
  } catch {
    // A damaged value: the defaults.
  }
  const pick = <K extends keyof Gestures>(key: K): Gestures[K] =>
    (CHOICES[key] as readonly unknown[]).includes(stored[key])
      ? (stored[key] as Gestures[K])
      : DEFAULT_GESTURES[key];
  return {
    emptyDayTap: pick('emptyDayTap'),
    eventTap: pick('eventTap'),
    dayHold: pick('dayHold'),
    monthTap: pick('monthTap'),
  };
}

let current: Gestures | null = null;
const listeners = new Set<() => void>();

export function getGestures(): Gestures {
  if (!current) current = read();
  return current;
}

export function setGesture<K extends keyof Gestures>(
  key: K,
  value: Gestures[K]
): void {
  current = { ...getGestures(), [key]: value };
  writePref(KEY, JSON.stringify(current));
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useGestures(): Gestures {
  return useSyncExternalStore(subscribe, getGestures, () => DEFAULT_GESTURES);
}
