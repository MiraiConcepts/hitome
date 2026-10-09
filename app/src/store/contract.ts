// Android's calendar store (CalendarContract): the URIs and column names the
// store backend reads and writes. Plain strings, so the logic stays testable
// without Android; values match android.provider.CalendarContract.

const BASE = 'content://com.android.calendar';

/**
 * A row id, checked before it goes into a path. An empty or odd id would
 * make `events/` (with no selection) address the whole Events table, so a
 * bad one fails the write instead.
 */
export function rowId(id: string | number | null | undefined): string {
  const text = typeof id === 'number' ? String(id) : id;
  if (typeof text !== 'string' || !/^\d+$/.test(text))
    throw new Error('That event is not one from this phone');
  return text;
}

/** A time in ms, checked for the same reason as rowId. */
function msPart(ms: number): string {
  if (!Number.isSafeInteger(ms)) throw new Error('Not a time: ' + String(ms));
  return String(ms);
}

export const URI = {
  calendars: `${BASE}/calendars`,
  events: `${BASE}/events`,
  event: (id: string | number) => `${BASE}/events/${rowId(id)}`,
  /** Insert an exception (one changed or cancelled occurrence) of a series. */
  exceptions: (seriesId: string | number) =>
    `${BASE}/exception/${rowId(seriesId)}`,
  reminders: `${BASE}/reminders`,
  /** Every occurrence overlapping [begin, end), recurring series expanded. */
  instances: (begin: number, end: number) =>
    `${BASE}/instances/when/${msPart(begin)}/${msPart(end)}`,
};

/** Events.STATUS_CANCELED — an exception that removes its occurrence. */
export const STATUS_CANCELED = 2;
/** Events.STATUS_CONFIRMED — what an un-cancelled exception goes back to
 *  (the provider refuses a null status). */
export const STATUS_CONFIRMED = 1;
/** Reminders.METHOD_ALERT. */
export const METHOD_ALERT = 1;
/** Calendars.CAL_ACCESS_CONTRIBUTOR — the least access that may write. */
export const ACCESS_CONTRIBUTOR = 500;

export const INSTANCE_COLUMNS = [
  'begin',
  'end',
  'event_id',
  'title',
  'description',
  'eventLocation',
  'allDay',
  'calendar_id',
  'calendar_displayName',
  'calendar_color',
  'displayColor',
  'rrule',
  'original_id',
  'originalInstanceTime',
  'hasAlarm',
  'dtstart',
  'duration',
  'eventTimezone',
  'eventStatus',
];

/** The series fields a copy (move, undo, split) carries across. */
export const EVENT_COLUMNS = [
  '_id',
  'calendar_id',
  'title',
  'description',
  'eventLocation',
  'dtstart',
  'dtend',
  'duration',
  'allDay',
  'rrule',
  'exdate',
  'eventTimezone',
  'eventEndTimezone',
  'availability',
  'accessLevel',
  'eventStatus',
  'original_id',
  'originalInstanceTime',
  'originalAllDay',
];

export const CALENDAR_COLUMNS = [
  '_id',
  'calendar_displayName',
  'calendar_color',
  'calendar_access_level',
  'visible',
  'sync_events',
  'account_type',
  'isPrimary',
];
