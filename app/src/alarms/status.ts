// Pure notification-permission classification and the copy that goes with it
// (no expo-notifications / react-native imports — bun-testable). The scheduler
// twins report a raw snapshot; this turns it into the one state the settings
// screen renders and the one action it offers.

export type PermissionSnapshot = {
  /** False when the platform has no notification API at all (some browsers). */
  supported: boolean;
  granted: boolean;
  /** True while a prompt would still be shown — i.e. never asked yet. */
  canAskAgain: boolean;
};

export type PermissionState =
  | 'unsupported'
  | 'granted'
  | 'undetermined'
  | 'blocked';

export function permissionState(snapshot: PermissionSnapshot): PermissionState {
  if (!snapshot.supported) return 'unsupported';
  if (snapshot.granted) return 'granted';
  // Not granted and no prompt left = permanently denied; the only way back is
  // the system's own settings.
  return snapshot.canAskAgain ? 'undetermined' : 'blocked';
}

/** What the settings section offers, given the state. */
export type StatusAction = 'enable' | 'open-system-settings' | 'none';

export type StatusCopy = {
  /** The status row's value — one or two words. */
  label: string;
  action: StatusAction;
};

/**
 * `canOpenSystemSettings` is false on web, where a denied site permission is
 * reversed in the browser's own site settings and nothing the app can open.
 */
export function statusCopy(
  state: PermissionState,
  { canOpenSystemSettings }: { canOpenSystemSettings: boolean }
): StatusCopy {
  switch (state) {
    case 'unsupported':
      return {
        label: 'Unsupported',
        action: 'none',
      };
    case 'granted':
      return {
        label: 'Allowed',
        action: 'none',
      };
    case 'undetermined':
      return {
        // Shown beside the toggle, so it only has to say on or off; how it
        // got that way (never asked, or switched off) is not the reader's
        // concern.
        label: 'Off',
        action: 'enable',
      };
    case 'blocked':
      return {
        label: 'Off',
        action: canOpenSystemSettings ? 'open-system-settings' : 'none',
      };
  }
}

/** The Reminders row's value — how many reminders are set to ring, from the
 *  reconciler's real output: '3 in the next 14 days'. The row's label says
 *  what is being counted, so this only gives the number and the window. */
export function scheduledLabel(count: number | null): string {
  if (count === null) return 'Counting…';
  if (count === 0) return 'None in the next 14 days';
  return `${count} in the next 14 days`;
}
