// Search: what a query matches, and which years of the agenda to read next.
// Pure (no React, no backend), so it runs under bun test and CI jest.
//
// A query matches as Outlook and Apple Mail match: every typed word must
// start a word somewhere in the event's title, place or notes, in any order
// ("den" finds Dennis and Dentist, not Golden). Case, accents and
// apostrophes are ignored ("cafe" finds Café, "obrien" finds O'Brien).
import type { CalEvent } from '@/caldav/types';
import { FIRST_YEAR, LAST_YEAR } from '@/utils/calendar-grid';

/**
 * One event as written, before any repeat is worked out: what search reads
 * to decide what matches and which years can hold it. `key` names what the
 * backend expands (a CalDAV object's URL, a store series' id).
 */
export type SearchEntry = {
  key: string;
  summary?: string;
  location?: string;
  description?: string;
  /** Its first start, in ms. */
  first: number;
  /** Its last end, in ms; null for a series with no end. */
  last: number | null;
};

/** A backend's events for search: every entry, read once, and the dates of
 *  the matching ones, worked out a stretch at a time. */
export type SearchIndex = {
  entries: SearchEntry[];
  occurrences(
    keys: ReadonlySet<string>,
    start: Date,
    end: Date
  ): Promise<CalEvent[]>;
};

type Token = {
  /** The word as matched: lower case, no accents, no apostrophes. */
  norm: string;
  /** Where it starts in the text. */
  start: number;
  /** For each letter of `norm`, where the text's letter that made it ends. */
  ends: number[];
};

/** Apostrophes join a word rather than split it: O'Brien is one word. */
const JOINER = /['’ʼ]/;
const WORD = /[\p{L}\p{N}]/u;

/** Letters Unicode does not split into a base and an accent. */
const PLAIN: Record<string, string> = {
  ø: 'o',
  æ: 'ae',
  œ: 'oe',
  ß: 'ss',
  ł: 'l',
  đ: 'd',
  ð: 'd',
  þ: 'th',
  ı: 'i',
};

function fold(ch: string): string {
  const lower = ch.toLowerCase();
  return (PLAIN[lower] ?? lower).normalize('NFD').replace(/\p{M}/gu, '');
}

function tokens(text: string): Token[] {
  const out: Token[] = [];
  let current: Token | null = null;
  let i = 0;
  for (const ch of text) {
    const end = i + ch.length;
    const folded = fold(ch);
    if (WORD.test(folded)) {
      if (!current) {
        current = { norm: '', start: i, ends: [] };
        out.push(current);
      }
      for (const letter of folded) {
        current.norm += letter;
        current.ends.push(end);
      }
    } else if (!(current && JOINER.test(ch))) {
      current = null;
    }
    i = end;
  }
  return out;
}

/** The words of a query, as they are matched. */
export function queryWords(query: string): string[] {
  return [...new Set(tokens(query).map((t) => t.norm))];
}

/** Every word starts a word somewhere in the fields. No words, no match. */
export function matchesFields(
  fields: (string | undefined)[],
  words: string[]
): boolean {
  if (words.length === 0) return false;
  const norms = fields.flatMap((f) => (f ? tokens(f).map((t) => t.norm) : []));
  return words.every((w) => norms.some((n) => n.startsWith(w)));
}

export function eventMatches(
  event: Pick<CalEvent, 'summary' | 'location' | 'description'>,
  words: string[]
): boolean {
  return matchesFields(
    [event.summary, event.location, event.description],
    words
  );
}

export function entryMatches(entry: SearchEntry, words: string[]): boolean {
  return matchesFields(
    [entry.summary, entry.location, entry.description],
    words
  );
}

/** The parts of `text` the words matched, as [start, end) pairs in order:
 *  the start of each word that a typed word begins. */
export function markRanges(text: string, words: string[]): [number, number][] {
  const out: [number, number][] = [];
  for (const token of tokens(text)) {
    let longest = 0;
    for (const w of words)
      if (w.length > longest && token.norm.startsWith(w)) longest = w.length;
    if (longest > 0) out.push([token.start, token.ends[longest - 1]]);
  }
  return out;
}

// ---- Which years to read -----------------------------------------------------

const DAY_MS = 86_400_000;

/** A span's years, a day wider each side: an all-day event is stored at UTC
 *  midnight, which is the day before in a zone west of UTC. */
function yearsOf(entry: Pick<SearchEntry, 'first' | 'last'>) {
  const first = Math.max(
    new Date(entry.first - DAY_MS).getFullYear(),
    FIRST_YEAR
  );
  const last =
    entry.last === null
      ? LAST_YEAR
      : Math.min(new Date(entry.last + DAY_MS).getFullYear(), LAST_YEAR);
  return { first, last };
}

/** The latest year before `year` that any of the entries can have a date
 *  in; null when none can. The years between hold nothing of theirs. */
export function yearBefore(
  entries: Pick<SearchEntry, 'first' | 'last'>[],
  year: number
): number | null {
  let best: number | null = null;
  for (const entry of entries) {
    const { first, last } = yearsOf(entry);
    if (first > year - 1) continue;
    const y = Math.min(last, year - 1);
    if (best === null || y > best) best = y;
  }
  return best;
}

/** The earliest year after `year` that any of the entries can have a date
 *  in; null when none can. */
export function yearAfter(
  entries: Pick<SearchEntry, 'first' | 'last'>[],
  year: number
): number | null {
  let best: number | null = null;
  for (const entry of entries) {
    const { first, last } = yearsOf(entry);
    if (last < year + 1) continue;
    const y = Math.max(first, year + 1);
    if (best === null || y < best) best = y;
  }
  return best;
}

export function yearStart(year: number): Date {
  return new Date(year, 0, 1);
}

// ---- The agenda --------------------------------------------------------------

export type AgendaRow =
  | { kind: 'month'; key: string; label: string }
  | { kind: 'event'; key: string; event: CalEvent };

/** The events in date order, each once, with a heading before each month. */
export function agendaRows(events: CalEvent[]): AgendaRow[] {
  const byId = new Map<string, CalEvent>();
  for (const e of events) byId.set(e.id, e);
  const sorted = [...byId.values()].sort(
    (a, b) =>
      a.start.getTime() - b.start.getTime() ||
      a.summary.localeCompare(b.summary)
  );
  const rows: AgendaRow[] = [];
  let month = '';
  for (const event of sorted) {
    const key = `${event.start.getFullYear()}-${event.start.getMonth()}`;
    if (key !== month) {
      month = key;
      rows.push({
        kind: 'month',
        key: `month-${key}`,
        label: event.start.toLocaleDateString(undefined, {
          month: 'long',
          year: 'numeric',
        }),
      });
    }
    rows.push({ kind: 'event', key: event.id, event });
  }
  return rows;
}

/** Where the agenda opens: the first event not yet over (its month's
 *  heading, when it is the month's first), else the end. */
export function upcomingIndex(rows: AgendaRow[], now: Date): number {
  const i = rows.findIndex(
    (r) => r.kind === 'event' && r.event.end.getTime() > now.getTime()
  );
  if (i < 0) return Math.max(rows.length - 1, 0);
  return i > 0 && rows[i - 1].kind === 'month' ? i - 1 : i;
}
