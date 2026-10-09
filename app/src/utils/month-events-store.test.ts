import {
  applyFetch,
  applySeed,
  isFresh,
  mergeEvents,
  monthKeyOf,
  type MonthStore,
  type StoreEventLike,
} from './month-events-store';

function ev(id: string, start: Date, end: Date): StoreEventLike {
  return { id, start, end };
}

const day = (y: number, m0: number, d: number, h = 0) => new Date(y, m0, d, h);

// July 2026 window: monday(Jul 1) − 7d … +49d ≈ Jun 22 – Aug 10.
const julRange = { start: day(2026, 5, 22), end: day(2026, 7, 10) };
// August 2026 window ≈ Jul 20 – Sep 14.
const augRange = { start: day(2026, 6, 20), end: day(2026, 8, 14) };

const JUL = monthKeyOf(2026, 6);
const AUG = monthKeyOf(2026, 7);

const empty: MonthStore<StoreEventLike> = new Map();

describe('applySeed', () => {
  it('adds a bucket for an unseen month', () => {
    const seeded = applySeed(empty, JUL, [
      ev('a', day(2026, 6, 8, 10), day(2026, 6, 8, 11)),
    ]);
    expect(mergeEvents(seeded).map((e) => e.id)).toEqual(['a']);
  });

  it('never clobbers an existing bucket (slow snapshot read after fetch)', () => {
    const fetched = applyFetch(
      empty,
      JUL,
      julRange,
      [ev('fresh', day(2026, 6, 8, 10), day(2026, 6, 8, 11))],
      1000
    );
    const seeded = applySeed(fetched, JUL, [
      ev('stale', day(2026, 6, 1), day(2026, 6, 2)),
    ]);
    expect(seeded).toBe(fetched);
  });
});

describe('applyFetch', () => {
  it('keeps other months loaded — no pop-out on navigation', () => {
    const julEvent = ev('jul', day(2026, 6, 8, 10), day(2026, 6, 8, 11));
    const augEvent = ev('aug', day(2026, 7, 20, 9), day(2026, 7, 20, 10));
    let store = applyFetch(empty, JUL, julRange, [julEvent], 1000);
    store = applyFetch(store, AUG, augRange, [augEvent], 2000);
    expect(
      mergeEvents(store)
        .map((e) => e.id)
        .sort()
    ).toEqual(['aug', 'jul']);
  });

  it('prunes events deleted on the server from overlapping buckets', () => {
    // Lives in the Jul window's slack week AND inside Aug's window.
    const shared = ev('shared', day(2026, 6, 28, 9), day(2026, 6, 28, 10));
    let store = applyFetch(empty, JUL, julRange, [shared], 1000);
    // Aug fetch no longer returns it → it was deleted server-side.
    store = applyFetch(store, AUG, augRange, [], 2000);
    expect(mergeEvents(store)).toEqual([]);
  });

  it('leaves other-bucket events outside the fetched range untouched', () => {
    const julOnly = ev('jul-only', day(2026, 6, 1, 9), day(2026, 6, 1, 10));
    let store = applyFetch(empty, JUL, julRange, [julOnly], 1000);
    store = applyFetch(store, AUG, augRange, [], 2000);
    expect(mergeEvents(store).map((e) => e.id)).toEqual(['jul-only']);
  });

  it('prunes zero-length events on the range boundary consistently', () => {
    const zero = ev('zero', day(2026, 6, 28, 9), day(2026, 6, 28, 9));
    let store = applyFetch(empty, JUL, julRange, [zero], 1000);
    store = applyFetch(store, AUG, augRange, [], 2000);
    expect(mergeEvents(store)).toEqual([]);
  });
});

describe('mergeEvents', () => {
  it('dedupes overlap-window duplicates, freshest fetch wins', () => {
    const stale = ev('e', day(2026, 6, 28, 9), day(2026, 6, 28, 10));
    const moved = ev('e', day(2026, 6, 29, 14), day(2026, 6, 29, 15));
    let store = applyFetch(empty, JUL, julRange, [stale], 1000);
    store = applyFetch(store, AUG, augRange, [moved], 2000);
    const merged = mergeEvents(store);
    expect(merged).toHaveLength(1);
    expect(merged[0].start).toEqual(moved.start);
  });

  it('prefers any fetch over a snapshot seed', () => {
    const seedCopy = ev('e', day(2026, 6, 28, 9), day(2026, 6, 28, 10));
    const fetchCopy = ev('e', day(2026, 6, 28, 11), day(2026, 6, 28, 12));
    let store = applyFetch(empty, AUG, augRange, [fetchCopy], 1000);
    store = applySeed(store, JUL, [seedCopy]);
    const merged = mergeEvents(store);
    expect(merged).toHaveLength(1);
    expect(merged[0].start).toEqual(fetchCopy.start);
  });
});

describe('isFresh', () => {
  it('is false for missing buckets, seeds, and aged fetches', () => {
    expect(isFresh(empty, JUL, 5000, 60_000)).toBe(false);
    const seeded = applySeed(empty, JUL, []);
    expect(isFresh(seeded, JUL, 5000, 60_000)).toBe(false);
    const fetched = applyFetch(empty, JUL, julRange, [], 1000);
    expect(isFresh(fetched, JUL, 1000 + 60_000, 60_000)).toBe(false);
    expect(isFresh(fetched, JUL, 1000 + 59_999, 60_000)).toBe(true);
  });
});

describe('a fetch that lands after a newer one', () => {
  // Stamps are when each request was issued: the late one went out first.
  it('does not put back an event the newer fetch of its month lacks', () => {
    const deleted = ev('gone', day(2026, 6, 8, 10), day(2026, 6, 8, 11));
    let store = applyFetch(empty, JUL, julRange, [deleted], 1000);
    // Issued at 3000, after the delete; lands first.
    store = applyFetch(store, JUL, julRange, [], 3000);
    // Issued at 2000, before the delete; lands last.
    const late = applyFetch(store, JUL, julRange, [deleted], 2000);
    expect(mergeEvents(late)).toEqual([]);
    expect(late).toBe(store);
  });

  it('does not put back an event a newer fetch of another month lacks', () => {
    // In both windows (Jul 28), deleted between the two requests.
    const deleted = ev('gone', day(2026, 6, 28, 9), day(2026, 6, 28, 10));
    let store = applyFetch(empty, JUL, julRange, [deleted], 1000);
    store = applyFetch(store, AUG, augRange, [deleted], 1000);
    // The refresh after the delete: July, issued at 3000.
    store = applyFetch(store, JUL, julRange, [], 3000);
    expect(mergeEvents(store)).toEqual([]);
    // A prefetch of August issued at 2000 lands now.
    store = applyFetch(store, AUG, augRange, [deleted], 2000);
    expect(mergeEvents(store)).toEqual([]);
  });

  it('keeps its events outside the newer fetch', () => {
    const augOnly = ev('aug-only', day(2026, 7, 20, 9), day(2026, 7, 20, 10));
    let store = applyFetch(empty, JUL, julRange, [], 3000);
    store = applyFetch(store, AUG, augRange, [augOnly], 2000);
    expect(mergeEvents(store).map((e) => e.id)).toEqual(['aug-only']);
  });

  it('does not prune what a newer fetch of another month found', () => {
    // Created between the two requests, in both windows.
    const created = ev('new', day(2026, 6, 28, 9), day(2026, 6, 28, 10));
    let store = applyFetch(empty, JUL, julRange, [created], 3000);
    store = applyFetch(store, AUG, augRange, [], 2000);
    expect(mergeEvents(store).map((e) => e.id)).toEqual(['new']);
  });
});
