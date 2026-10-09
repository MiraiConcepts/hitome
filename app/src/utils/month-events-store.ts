// Pure state transitions for the accumulating month-event store: one bucket
// per fetched/seeded month window, merged for rendering. Months are never
// dropped on navigation — that's what killed chips mid-scroll before — they
// only get replaced by fresher fetches. No React imports — runs under bun
// test and CI jest.

/** The minimal event shape the store needs (CalEvent satisfies it). */
export type StoreEventLike = { id: string; start: Date; end: Date };

export type MonthBucket<T extends StoreEventLike> = {
  events: T[];
  /** Epoch ms the fetch that produced this bucket was issued (not when it
   *  landed); 0 = snapshot seed. */
  fetchedAt: number;
  /** The window that fetch covered; none for a seed. */
  range?: { start: Date; end: Date };
};

export type MonthStore<T extends StoreEventLike> = ReadonlyMap<
  string,
  MonthBucket<T>
>;

export function monthKeyOf(year: number, month0: number): string {
  return `${year}-${month0}`;
}

/** Event intersects [start, end)? `end` is exclusive; zero-length events
 *  count on their start day (same max(start, end−1) convention as the grid). */
function intersects(
  event: StoreEventLike,
  range: { start: Date; end: Date }
): boolean {
  const lastMs = Math.max(event.start.getTime(), event.end.getTime() - 1);
  return (
    event.start.getTime() < range.end.getTime() &&
    lastMs >= range.start.getTime()
  );
}

/**
 * Seed a month from its disk snapshot. A no-op (same store reference) when the
 * bucket already exists — a slow snapshot read must never clobber landed
 * network data, and fresher seeds have nothing better to offer.
 */
export function applySeed<T extends StoreEventLike>(
  store: MonthStore<T>,
  key: string,
  events: T[]
): MonthStore<T> {
  if (store.has(key)) return store;
  const next = new Map(store);
  next.set(key, { events, fetchedAt: 0 });
  return next;
}

/**
 * Land a network fetch: replace the month's bucket and prune every other
 * bucket of events that intersect the fetched range but are absent from the
 * result — a CalDAV time-range report is authoritative for its whole window,
 * so anything missing was deleted (or moved away) on the server.
 *
 * `fetchedAt` is when the request was issued, and a fetch only speaks for
 * the server as it was then: one that lands after a newer fetch of its month
 * is dropped, it prunes only buckets older than itself, and it brings back
 * nothing a newer bucket's window shows is gone (a poll that went out before
 * a delete must not put the event back).
 */
export function applyFetch<T extends StoreEventLike>(
  store: MonthStore<T>,
  key: string,
  range: { start: Date; end: Date },
  events: T[],
  fetchedAt: number
): MonthStore<T> {
  const current = store.get(key);
  if (current && current.fetchedAt > fetchedAt) return store;
  const newer = [...store]
    .filter(([otherKey, b]) => otherKey !== key && b.fetchedAt > fetchedAt)
    .map(([, b]) => ({
      range: b.range,
      ids: new Set(b.events.map((e) => e.id)),
    }));
  const landed = events.filter((event) =>
    newer.every(
      (b) => !b.range || b.ids.has(event.id) || !intersects(event, b.range)
    )
  );
  const ids = new Set(landed.map((event) => event.id));
  const next = new Map<string, MonthBucket<T>>();
  for (const [otherKey, bucket] of store) {
    if (otherKey === key) continue;
    if (bucket.fetchedAt > fetchedAt) {
      next.set(otherKey, bucket);
      continue;
    }
    const kept = bucket.events.filter(
      (event) => ids.has(event.id) || !intersects(event, range)
    );
    next.set(
      otherKey,
      kept.length === bucket.events.length
        ? bucket
        : { ...bucket, events: kept }
    );
  }
  next.set(key, { events: landed, fetchedAt, range });
  return next;
}

/**
 * The render feed: all buckets merged, deduped by event id. Buckets overlap
 * by design (each month window spans ~8 weeks), so duplicates are the norm;
 * the freshest bucket's copy wins, which also retires stale copies of events
 * that were edited or moved.
 */
export function mergeEvents<T extends StoreEventLike>(
  store: MonthStore<T>
): T[] {
  const buckets = [...store.values()].sort((a, b) => a.fetchedAt - b.fetchedAt);
  const byId = new Map<string, T>();
  for (const bucket of buckets) {
    for (const event of bucket.events) byId.set(event.id, event);
  }
  return [...byId.values()];
}

/** Bucket exists and was fetched (not just seeded) within `maxAgeMs` of `now`. */
export function isFresh<T extends StoreEventLike>(
  store: MonthStore<T>,
  key: string,
  now: number,
  maxAgeMs: number
): boolean {
  const bucket = store.get(key);
  return (
    bucket != null && bucket.fetchedAt > 0 && now - bucket.fetchedAt < maxAgeMs
  );
}
