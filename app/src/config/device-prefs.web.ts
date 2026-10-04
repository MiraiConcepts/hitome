// Web twin of device-prefs.ts: browser storage. These are display preferences,
// never credentials.
export function readPref(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // Best-effort, as on native.
  }
}
