// Android holds no CalDAV login (since v0.5): it reads and writes the phone's
// calendar store, which DAVx⁵ or another sync app keeps in step with the
// server, and that app holds the login. So there is nothing to read or keep
// here; dav-store still imports this module on Android through the prefs
// that subscribe to it. Web twin: dav-storage.web.ts (derives, never stores).
import type { DavConfig } from './dav-config';

export async function readStoredConfig(): Promise<DavConfig | null> {
  return null;
}

export async function writeStoredConfig(_config: DavConfig): Promise<void> {
  // No login on Android, so there is nothing to persist.
}

export async function readLastConfig(): Promise<DavConfig | null> {
  return null;
}

export async function clearLastConfig(): Promise<void> {
  // No login on Android, so there is nothing to clear.
}
