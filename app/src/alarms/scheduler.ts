// Android notification backend for event alarms (expo-notifications).
// Geometry/behavior twin: scheduler.web.ts (tab-open timer + Notification API).
// Exact delivery comes from USE_EXACT_ALARM / SCHEDULE_EXACT_ALARM in app.json
// (install-time grants — the library then takes its setExactAndAllowWhileIdle
// branch); reboot replay is handled by the library's BOOT_COMPLETED receiver.
import * as Notifications from 'expo-notifications';
import { Linking } from 'react-native';

import { toDateString } from '@/utils/date';

import {
  JOIN_ACTION,
  REMINDER_CATEGORY,
  REMINDER_JOIN_CATEGORY,
  type ReminderData,
  SNOOZE_ACTION,
  SNOOZE_ID_PREFIX,
  SNOOZE_MINUTES,
} from './actions';
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
  await registerReminderCategories();
}

/**
 * The buttons on a reminder. Snooze is answered without opening the app (the
 * background task in alarms/background-task.ts handles it when hitome is
 * closed); Join has to open it, to hand the link to the browser or meeting app.
 */
export async function registerReminderCategories(): Promise<void> {
  const snooze: Notifications.NotificationAction = {
    identifier: SNOOZE_ACTION,
    buttonTitle: `Snooze ${SNOOZE_MINUTES} min`,
    options: { opensAppToForeground: false },
  };
  const join: Notifications.NotificationAction = {
    identifier: JOIN_ACTION,
    buttonTitle: 'Join',
    options: { opensAppToForeground: true },
  };
  await Notifications.setNotificationCategoryAsync(REMINDER_CATEGORY, [snooze]);
  await Notifications.setNotificationCategoryAsync(REMINDER_JOIN_CATEGORY, [
    join,
    snooze,
  ]);
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
      // A real reminder's buttons, so the test shows (and Snooze proves)
      // exactly what one will.
      categoryIdentifier: REMINDER_CATEGORY,
      data: { day: toDateString(new Date()) } satisfies ReminderData,
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
        data: {
          day: alarm.day,
          event: alarm.event,
          ...(alarm.join ? { join: alarm.join } : {}),
        } satisfies ReminderData,
        categoryIdentifier: alarm.join
          ? REMINDER_JOIN_CATEGORY
          : REMINDER_CATEGORY,
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

/** Every scheduled reminder and snooze — the account they came from is gone. */
export async function cancelAllReminders(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function cancelAlarm(id: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(id);
}

/**
 * Snooze: the same reminder again in SNOOZE_MINUTES, and this one cleared.
 * Keyed by the reminder it came from, so a tap answered twice (the app's
 * listener and the background task can both see it) schedules one, not two.
 */
export async function snoozeReminder(
  response: Notifications.NotificationResponse
): Promise<void> {
  const { request } = response.notification;
  const original = request.identifier.replace(SNOOZE_ID_PREFIX, '');
  await ensureSetup();
  await Notifications.scheduleNotificationAsync({
    identifier: `${SNOOZE_ID_PREFIX}${original}`,
    content: {
      title: request.content.title ?? 'Reminder',
      body: request.content.body ?? undefined,
      data: request.content.data,
      categoryIdentifier: request.content.categoryIdentifier ?? undefined,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(Date.now() + SNOOZE_MINUTES * 60_000),
      channelId: CHANNEL_ID,
    },
  });
  await Notifications.dismissNotificationAsync(request.identifier);
}

/**
 * What a reminder's tap or button asks for. Snooze and Join are carried out
 * here; a plain tap is passed to `open` with the event to show.
 */
export async function answerReminder(
  response: Notifications.NotificationResponse,
  open: (target: { day: string; event?: string }) => void
): Promise<void> {
  const data = response.notification.request.content.data as
    | Partial<ReminderData>
    | undefined;
  if (response.actionIdentifier === SNOOZE_ACTION) {
    await snoozeReminder(response);
    return;
  }
  if (response.actionIdentifier === JOIN_ACTION && data?.join) {
    await Notifications.dismissNotificationAsync(
      response.notification.request.identifier
    );
    await Linking.openURL(data.join);
    return;
  }
  if (typeof data?.day === 'string') open({ day: data.day, event: data.event });
}

/**
 * Reminder taps and buttons while the app is running, and the tap that cold-
 * started it. The cold-start response is cleared once answered, or every
 * later launch would reopen the same event. Returns an unsubscribe.
 */
export function onAlarmTap(
  open: (target: { day: string; event?: string }) => void
): () => void {
  const deliver = (response: Notifications.NotificationResponse | null) => {
    if (!response) return;
    answerReminder(response, open).catch(() => {});
  };
  const sub = Notifications.addNotificationResponseReceivedListener(deliver);
  const last = Notifications.getLastNotificationResponse();
  if (last) {
    deliver(last);
    Notifications.clearLastNotificationResponse();
  }
  return () => sub.remove();
}
