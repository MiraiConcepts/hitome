// Web notification backend for event alarms — deliberately best-effort: a
// ~30s timer fires `new Notification()` while a tab is open (expo-notifications
// has no web support in SDK 56; Notification Triggers never shipped; Web Push
// would route through a third-party push service). Android is the real
// delivery path. Geometry/behavior twin: scheduler.ts.
import { getSessionStatus, subscribeSession } from '@/config/session';

import { ALARM_ID_PREFIX, type DesiredAlarm } from './occurrences';
import type { PermissionSnapshot } from './status';

const CHECK_MS = 30_000;

/** Named for the twin's channel; web has no channels, so this is diagnostics
 *  copy only. */
export const CHANNEL_ID = 'browser';

/** The web test fires at once — there is no background delivery to wait for. */
export const TEST_DELAY_SECONDS = 0;

const scheduled = new Map<string, DesiredAlarm>();
let timer: ReturnType<typeof setInterval> | null = null;
let tapCb: ((target: { day: string; event?: string }) => void) | null = null;

function supported(): boolean {
  return typeof Notification !== 'undefined';
}

function checkDue(): void {
  const now = Date.now();
  for (const alarm of [...scheduled.values()]) {
    if (alarm.fireDate.getTime() > now) continue;
    scheduled.delete(alarm.id);
    if (!supported() || Notification.permission !== 'granted') continue;
    try {
      const n = new Notification(alarm.title, {
        body: alarm.body,
        tag: alarm.id,
      });
      n.onclick = () => {
        window.focus();
        tapCb?.({ day: alarm.day, event: alarm.event });
      };
    } catch {
      // Some mobile browsers only allow ServiceWorker notifications — treat
      // as unsupported and stay silent.
    }
  }
}

export async function ensureSetup(): Promise<void> {
  if (!supported() || timer) return;
  timer = setInterval(checkDue, CHECK_MS);
}

/** Ask for permission — must be called from a user gesture (browser rule). */
export async function requestPermissionIfNeeded(): Promise<void> {
  if (!supported() || Notification.permission !== 'default') return;
  try {
    await Notification.requestPermission();
  } catch {
    // Older callback-style browsers — best-effort.
  }
}

export async function notificationsBlocked(): Promise<boolean> {
  return !supported() || Notification.permission === 'denied';
}

export async function permissionSnapshot(): Promise<PermissionSnapshot> {
  if (!supported())
    return { supported: false, granted: false, canAskAgain: false };
  const permission = Notification.permission;
  return {
    supported: true,
    granted: permission === 'granted',
    // 'default' is the only state a prompt can still be raised from.
    canAskAgain: permission === 'default',
  };
}

/** How long to wait for the browser to say it showed the test. */
const TEST_CONFIRM_MS = 3000;

/**
 * Immediate, for the same reason the scheduler is a timer: there is nothing
 * to wake, so nothing is proven by delaying it. Resolves only once the
 * browser says it showed the notification, and throws otherwise (refused,
 * failed, or silent), so Settings never says "Sent" for one that was not:
 * before, every failure was swallowed and reported as sent. Each test gets
 * its own tag, because a repeated tag replaces the last one without a banner.
 */
export async function sendTestNotification(): Promise<void> {
  await ensureSetup();
  if (!supported() || Notification.permission !== 'granted')
    throw new Error('This browser isn’t allowing notifications from hitome.');
  let n: Notification;
  try {
    n = new Notification('hitome', {
      body: 'Test notification. Reminders can ring in this tab.',
      tag: `test-notification-${Date.now()}`,
    });
  } catch {
    // Chrome on Android and some others only allow notifications from a
    // service worker, which the web app does not have.
    throw new Error(
      'This browser can’t show hitome’s notifications. Use the Android app for reminders on a phone.'
    );
  }
  await new Promise<void>((resolve, reject) => {
    // No word either way: the browser took it and went quiet, which is what
    // a browser blocking it in private (a privacy mode, or the system not
    // letting the browser notify) looks like from here.
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            'The browser took the notification but never showed it. Check your system’s notification settings for this browser, and its privacy settings.'
          )
        ),
      TEST_CONFIRM_MS
    );
    n.onshow = () => {
      clearTimeout(timer);
      resolve();
    };
    n.onerror = () => {
      clearTimeout(timer);
      reject(new Error('The browser couldn’t show the notification.'));
    };
  });
}

export async function listScheduledAlarmIds(): Promise<string[]> {
  return [...scheduled.keys()].filter((id) => id.startsWith(ALARM_ID_PREFIX));
}

export async function scheduleAlarm(alarm: DesiredAlarm): Promise<void> {
  scheduled.set(alarm.id, alarm);
}

export async function cancelAllReminders(): Promise<void> {
  scheduled.clear();
}

export async function cancelAlarm(id: string): Promise<void> {
  scheduled.delete(id);
}

export function onAlarmTap(
  cb: (target: { day: string; event?: string }) => void
): () => void {
  tapCb = cb;
  return () => {
    if (tapCb === cb) tapCb = null;
  };
}

// Queued reminders carry the titles and places of the login that fetched
// them: when it ends (Log out, or the server ending the session), none may
// ring over the login screen.
subscribeSession(() => {
  if (getSessionStatus() !== 'signed-in') scheduled.clear();
});
