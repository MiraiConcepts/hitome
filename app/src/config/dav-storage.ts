// Native credential storage: the OS keystore, via expo-secure-store. This is
// where DAVx⁵ and Apple Calendar keep the same thing, and for the same reason
// — CalDAV is Basic auth, so there is no token to hold instead of the real
// password. Web override: dav-storage.web.ts (derives, never stores).
//
// The URL and username are kept in the same item as the password rather than
// split across SecureStore and a plain file: one read, one write, and no way
// for the two halves to disagree about which server a password belongs to.
import * as SecureStore from 'expo-secure-store';

import type { DavConfig } from './dav-config';

const KEY = 'dav-config';

/** True where a typed-in server address is the way in (i.e. not web). */
export const CONFIGURABLE = true;

export async function readStoredConfig(): Promise<DavConfig | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DavConfig>;
    if (typeof parsed.url !== 'string' || !parsed.url) return null;
    return {
      url: parsed.url,
      username: typeof parsed.username === 'string' ? parsed.username : '',
      password: typeof parsed.password === 'string' ? parsed.password : '',
    };
  } catch {
    // A keystore that will not open reads as "not configured" — the setup
    // screen is a better answer than a crash on launch.
    return null;
  }
}

export async function writeStoredConfig(config: DavConfig): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(config));
}

export async function clearStoredConfig(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}
