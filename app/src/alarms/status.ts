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
  /** The line under it, explaining what that means for reminders. */
  detail: string;
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
        detail:
          'This browser cannot show notifications, so reminders stay put.',
        action: 'none',
      };
    case 'granted':
      return {
        label: 'Allowed',
        detail: 'Reminders can ring here. Send a test to be sure.',
        action: 'none',
      };
    case 'undetermined':
      return {
        label: 'Not asked yet',
        detail: 'Allow notifications so event reminders can ring.',
        action: 'enable',
      };
    case 'blocked':
      return {
        label: 'Blocked',
        detail: canOpenSystemSettings
          ? 'Notifications are off for hitome — no reminder will ring until they are turned back on.'
          : "Notifications are blocked for this site — turn them back on in your browser's site settings.",
        action: canOpenSystemSettings ? 'open-system-settings' : 'none',
      };
  }
}

/** '3 reminders scheduled' — the reconciler's real output, in one line. */
export function scheduledLabel(count: number | null): string {
  if (count === null) return 'Counting scheduled reminders…';
  if (count === 0) return 'No reminders scheduled for the next 14 days.';
  return `${count} reminder${count === 1 ? '' : 's'} scheduled for the next 14 days.`;
}
