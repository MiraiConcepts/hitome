// Reminder buttons pressed while hitome is closed. Android runs this task in a
// headless JS context for a notification action whose button does not open the
// app (Snooze) — registered from index.ts, at module scope, as the task manager
// requires. Join opens the app and is answered there (alarms/scheduler.ts).
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { SNOOZE_ACTION } from './actions';
import { snoozeReminder } from './scheduler';

const TASK = 'hitome-reminder-actions';

if (Platform.OS === 'android') {
  TaskManager.defineTask<Notifications.NotificationTaskPayload>(
    TASK,
    async ({ data }) => {
      if (
        data &&
        'actionIdentifier' in data &&
        data.actionIdentifier === SNOOZE_ACTION
      )
        await snoozeReminder(data);
      return Notifications.BackgroundNotificationTaskResult.NoData;
    }
  );
  Notifications.registerTaskAsync(TASK).catch(() => {});
}
