// Web backend for snapshot-cache: one IndexedDB store keyed by snapshot key.
// Values must stay JSON-serializable
// so both platforms round-trip identically. Best-effort: failures cost
// freshness only.
import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'hitome-snapshots';
const STORE = 'snapshots';

let dbPromise: Promise<IDBPDatabase> | null = null;
const db = () =>
  (dbPromise ??= openDB(DB_NAME, 1, {
    upgrade(d) {
      d.createObjectStore(STORE);
    },
  }));

/** Read a snapshot; null when missing or unreadable. */
export async function readSnapshot<T>(key: string): Promise<T | null> {
  try {
    return ((await (await db()).get(STORE, key)) as T | undefined) ?? null;
  } catch {
    return null;
  }
}

/** Fire-and-forget write; the next successful write overwrites. */
export function writeSnapshot(key: string, value: unknown): void {
  db()
    .then((d) => d.put(STORE, value, key))
    .catch(() => {
      // Not worth surfacing — the cache only ever costs freshness.
    });
}
