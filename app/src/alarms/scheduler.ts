// Android notification backend for event alarms (expo-notifications).
// Geometry/behavior twin: scheduler.web.ts (tab-open timer + Notification API).
// Exact delivery comes from USE_EXACT_ALARM / SCHEDULE_EXACT_ALARM in app.json
// (install-time grants — the library then takes its setExactAndAllowWhileIdle
// branch); reboot replay is handled by the library's BOOT_COMPLETED receiver.
import * as Notifications from 'expo-notifications';

import { ALARM_ID_PREFIX, type DesiredAlarm } from './occurrences';
import type { PermissionSnapshot } from './status';

export const CHANNEL_ID = 'event-alarms';

/** The test notification's id — deliberately outside ALARM_ID_PREFIX so a
 *  reconcile can never mistake it for a stale reminder and cancel it. */
const TEST_ID = 'test-notification';

/** How far out the test fires, so the app can be backgrounded to watch it. */
export const TEST_DELAY_SECONDS = 5;

let setupDone = false;

/** Channel + foreground-display handler. Idempotent; call before scheduling. */
export async function ensureSetup(): Promise<void> {
  if (setupDone) return;
  setupDone = true;
  // Without a handler, alarms firing while the app is foregrounded show
  // nothing at all.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Event alarms',
    importance: Notifications.AndroidImportance.HIGH,
  });
}

/** Ask for POST_NOTIFICATIONS (Android 13+) — call from a user gesture. */
export async function requestPermissionIfNeeded(): Promise<void> {
  const status = await Notifications.getPermissionsAsync();
  if (!status.granted && status.canAskAgain)
    await Notifications.requestPermissionsAsync();
}

/** True when alarms can never ring here (permission permanently denied). */
export async function notificationsBlocked(): Promise<boolean> {
  const status = await Notifications.getPermissionsAsync();
  return !status.granted && !status.canAskAgain;
}

/** Raw permission state for the settings screen's status row. */
export async function permissionSnapshot(): Promise<PermissionSnapshot> {
  const status = await Notifications.getPermissionsAsync();
  return {
    supported: true,
    granted: status.granted,
    canAskAgain: status.canAskAgain,
  };
}

/**
 * One-off notification a few seconds out — the only way to prove from inside
 * the app that the channel, the permission and AlarmManager all line up. Goes
 * through the same channel and trigger type as a real reminder, so a test that
 * rings means reminders can ring.
 */
export async function sendTestNotification(): Promise<void> {
  await ensureSetup();
  await Notifications.scheduleNotificationAsync({
    identifier: TEST_ID,
    content: {
      title: 'hitome',
      body: 'Test notification — event reminders can ring on this device.',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(Date.now() + TEST_DELAY_SECONDS * 1000),
      channelId: CHANNEL_ID,
    },
  });
}

export async function listScheduledAlarmIds(): Promise<string[]> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  return all
    .map((request) => request.identifier)
    .filter((id) => id.startsWith(ALARM_ID_PREFIX));
}

export async function scheduleAlarm(alarm: DesiredAlarm): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: alarm.id, // same id replaces — reconcile stays idempotent
      content: {
        title: alarm.title,
        body: alarm.body,
        data: { day: alarm.day },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: alarm.fireDate,
        channelId: CHANNEL_ID,
      },
    });
  } catch {
    // Android caps concurrent alarms (~500/app); a miss self-heals on the
    // next reconcile once the horizon rolls.
  }
}

export async function cancelAlarm(id: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(id);
}

/**
 * Notification-tap deep-link: yields the occurrence's day ('YYYY-MM-DD').
 * Covers warm taps and the cold-start tap. Returns an unsubscribe.
 */
export function onAlarmTap(cb: (day: string) => void): () => void {
  const deliver = (
    response: Notifications.NotificationResponse | null
  ): void => {
    const day = response?.notification.request.content.data?.day;
    if (typeof day === 'string') cb(day);
  };
  const sub = Notifications.addNotificationResponseReceivedListener(deliver);
  Notifications.getLastNotificationResponseAsync().then(deliver, () => {});
  return () => sub.remove();
}
