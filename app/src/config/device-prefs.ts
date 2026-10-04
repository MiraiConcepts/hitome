// Small per-device preferences that must be readable synchronously at launch
// and outlive a server change (unlike the snapshot cache, which a new account
// clears). Native: the keystore's synchronous API. Web twin: device-prefs.web.ts.
import * as SecureStore from 'expo-secure-store';

export function readPref(key: string): string | null {
  try {
    return SecureStore.getItem(key);
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string): void {
  try {
    SecureStore.setItem(key, value);
  } catch {
    // Best-effort: the default applies next launch.
  }
}
