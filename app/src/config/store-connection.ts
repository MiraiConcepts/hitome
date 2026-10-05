// Android: whether hitome is disconnected from the phone's calendars — its
// own switch, since an app cannot take back its calendar permission while it
// runs. Disconnected, the store backend reads no calendars at all (grid,
// widget and reminders go empty) and the first-run screen comes back; Allow
// there connects again. Kept per device, read synchronously at launch.
import { readPref, writePref } from './device-prefs';

const KEY = 'store_disconnected';

export function isStoreDisconnected(): boolean {
  return readPref(KEY) === '1';
}

export function setStoreDisconnected(disconnected: boolean): void {
  writePref(KEY, disconnected ? '1' : '0');
}
