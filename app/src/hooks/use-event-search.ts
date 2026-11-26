// Search's state: the events read once when search opens, and the agenda
// for the words typed, a year at a time outward from today.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { CalEvent } from '@/caldav/types';
import { loadSearchIndex } from '@/data/events';
import {
  agendaRows,
  entryMatches,
  eventMatches,
  queryWords,
  yearAfter,
  yearBefore,
  yearStart,
  type AgendaRow,
  type SearchEntry,
  type SearchIndex,
} from '@/utils/search';

/** Enough on each side of today to fill a phone's screen before the first
 *  scroll asks for more. */
const FILL_EACH_SIDE = 12;
/** Typing pauses this long before the dates are worked out again; the words
 *  themselves match at once. */
const SETTLE_MS = 120;

type Window = {
  /** The words this window is for. */
  query: string;
  /** The years read, low to high; every year between holds nothing more. */
  low: number;
  high: number;
  events: CalEvent[];
  earlierDone: boolean;
  laterDone: boolean;
};

export type EventSearch = {
  rows: AgendaRow[];
  /** The first read is under way (or a year's, at either end). */
  loading: boolean;
  /** The events could not be read: only what the grid had loaded is searched. */
  partial: boolean;
  earlierDone: boolean;
  laterDone: boolean;
  loadEarlier: () => void;
  loadLater: () => void;
};

/**
 * `reload` changes when something was saved from a result: the events are
 * read again so the list shows it as it now is. `fallback` is what the grid
 * has loaded, searched instead when the read fails (offline on the web).
 * `load` reads the events (the backend's; the gallery hands in samples).
 */
export function useEventSearch(
  query: string,
  fallback: CalEvent[],
  reload: number,
  load: () => Promise<SearchIndex> = loadSearchIndex
): EventSearch {
  const [index, setIndex] = useState<SearchIndex | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    load()
      .then((next) => {
        if (!live) return;
        setIndex(next);
        setFailed(false);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [reload, load]);

  const words = useMemo(() => queryWords(query), [query]);
  const key = words.join(' ');
  const [settled, setSettled] = useState(key);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(key), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [key]);

  const matched = useMemo<SearchEntry[]>(() => {
    const w = settled ? settled.split(' ') : [];
    return index ? index.entries.filter((e) => entryMatches(e, w)) : [];
  }, [index, settled]);

  const [win, setWin] = useState<Window | null>(null);
  const busy = useRef(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Each window is made for one set of words from one read; a newer one
  // makes the older one's answers moot.
  const run = useRef(0);
  const read = useCallback(
    async (year: number) => {
      if (!index || matched.length === 0) return [];
      const keys = new Set(matched.map((e) => e.key));
      const w = settled.split(' ');
      const found = await index.occurrences(
        keys,
        yearStart(year),
        yearStart(year + 1)
      );
      return found.filter((e) => eventMatches(e, w));
    },
    [index, matched, settled]
  );

  useEffect(() => {
    const mine = ++run.current;
    if (!index || !settled) return;
    (async () => {
      const now = new Date();
      const year = now.getFullYear();
      let low = year;
      let high = year;
      const events = await read(year);
      let before = events.filter((e) => e.end <= now).length;
      let after = events.length - before;
      let earlierDone = false;
      let laterDone = false;
      while (before < FILL_EACH_SIDE) {
        const next = yearBefore(matched, low);
        if (next === null) {
          earlierDone = true;
          break;
        }
        const more = await read(next);
        events.push(...more);
        before += more.length;
        low = next;
      }
      while (after < FILL_EACH_SIDE) {
        const next = yearAfter(matched, high);
        if (next === null) {
          laterDone = true;
          break;
        }
        const more = await read(next);
        events.push(...more);
        after += more.length;
        high = next;
      }
      if (run.current !== mine) return;
      setWin({ query: settled, low, high, events, earlierDone, laterDone });
    })().catch(() => {
      if (run.current === mine) setFailed(true);
    });
  }, [index, settled, matched, read]);

  // The last window made, kept on screen while the next is worked out (its
  // events filtered by the words as they are now), so typing never blanks
  // the list. Only one made for these very words is paged further.
  const shown = index ? win : null;
  const current = shown && shown.query === key ? shown : null;

  const extend = useCallback(
    async (side: 'earlier' | 'later') => {
      if (!current || busy.current) return;
      if (side === 'earlier' ? current.earlierDone : current.laterDone) return;
      const mine = run.current;
      busy.current = true;
      setLoadingMore(true);
      try {
        const next =
          side === 'earlier'
            ? yearBefore(matched, current.low)
            : yearAfter(matched, current.high);
        const more = next === null ? [] : await read(next);
        if (run.current !== mine) return;
        setWin((w) =>
          w && w.query === current.query
            ? {
                ...w,
                events: [...w.events, ...more],
                ...(side === 'earlier'
                  ? next === null
                    ? { earlierDone: true }
                    : { low: next }
                  : next === null
                    ? { laterDone: true }
                    : { high: next }),
              }
            : w
        );
      } finally {
        busy.current = false;
        setLoadingMore(false);
      }
    },
    [current, matched, read]
  );

  const partial = failed && !index;
  const rows = useMemo(() => {
    if (words.length === 0) return [];
    if (partial)
      return agendaRows(fallback.filter((e) => eventMatches(e, words)));
    if (!shown) return [];
    return agendaRows(shown.events.filter((e) => eventMatches(e, words)));
  }, [words, partial, shown, fallback]);

  return {
    rows,
    loading: words.length > 0 && !partial && (!current || loadingMore),
    partial,
    earlierDone: partial || (current?.earlierDone ?? true),
    laterDone: partial || (current?.laterDone ?? true),
    loadEarlier: () => void extend('earlier'),
    loadLater: () => void extend('later'),
  };
}
