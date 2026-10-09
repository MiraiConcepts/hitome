// The app's event operations, one backend per platform: the web talks CalDAV
// to the server (this file); Android works on the phone's calendar store,
// kept in sync by DAVx⁵ or another sync app (events.android.ts). Screens,
// the widget and the reminder runner import from here, never a backend.
export {
  ConflictError,
  calendarUrlOf,
  createEvent,
  defaultCalendarUrl,
  deleteEvent,
  fetchMonth,
  isAuthFailure,
  listCalendars,
  moveEvent,
  undoDelete,
  updateEvent,
  type CalendarChoice,
  type EditScope,
} from '@/caldav/events';

/** Sync now. The web has nothing to ask — its fetches go to the server. */
export async function requestSync(): Promise<boolean> {
  return false;
}

/** End the Undo window for deletes. The web has none waiting: its delete
 *  is made at once, and Undo puts the exact object back. */
export async function commitDeletes(): Promise<void> {}

/** Changes to local calendar data. The web has none to watch. */
export function subscribeStore(_listener: () => void): () => void {
  return () => {};
}
