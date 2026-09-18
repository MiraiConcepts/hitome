// Generic last-good JSON snapshots, one file per key in the document
// directory. Hermes has no IndexedDB, so native stores plain files (web
// override: snapshot-cache.web.ts). Values must be JSON-serializable — the
// native side stringifies, so Dates etc. must be encoded by the caller.
// Best-effort on both sides: a miss or failed write only costs freshness.
import { File, Paths } from 'expo-file-system';

const fileFor = (key: string) =>
  new File(
    Paths.document,
    `snapshot-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}.json`
  );

/** Read a snapshot; null when missing or unreadable. */
export async function readSnapshot<T>(key: string): Promise<T | null> {
  try {
    return JSON.parse(await fileFor(key).text()) as T;
  } catch {
    return null;
  }
}

/** Fire-and-forget write; the next successful write overwrites. */
export function writeSnapshot(key: string, value: unknown): void {
  try {
    fileFor(key).write(JSON.stringify(value));
  } catch {
    // Not worth surfacing — the cache only ever costs freshness.
  }
}

/**
 * Drop every snapshot. Called when the calendar server changes: keys are not
 * namespaced by server, and a cached CalEvent carries the old host's absolute
 * url and etag — so a stale snapshot would not merely be out of date, it would
 * paint one server's events under another's name and aim an undo-delete at the
 * wrong host.
 */
export async function clearSnapshots(): Promise<void> {
  try {
    for (const entry of Paths.document.list()) {
      if (entry instanceof File && /^snapshot-.*\.json$/.test(entry.name))
        entry.delete();
    }
  } catch {
    // Same best-effort contract as the rest of this module.
  }
}
