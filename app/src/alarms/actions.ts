// What a reminder notification offers besides a tap. Pure constants, shared by
// the scheduler (which registers and attaches them) and the background task
// (which answers them while the app is closed).

/** Category for a reminder with no meeting link: Snooze only. */
export const REMINDER_CATEGORY = 'reminder';
/** Category for a reminder whose event has a meeting link: Join and Snooze. */
export const REMINDER_JOIN_CATEGORY = 'reminder-join';

export const SNOOZE_ACTION = 'snooze';
export const JOIN_ACTION = 'join';

export const SNOOZE_MINUTES = 10;

/** Snoozed reminders sit outside ALARM_ID_PREFIX, so a reconcile never takes
 *  one for a stale alarm and cancels it. */
export const SNOOZE_ID_PREFIX = 'snooze:';

/** What a reminder carries for its tap and its buttons. */
export type ReminderData = {
  /** The occurrence's local day ('YYYY-MM-DD'). */
  day: string;
  /** CalEvent.id — a tap opens this event. */
  event?: string;
  /** Meeting link for Join. */
  join?: string;
};
