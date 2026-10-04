/** A calendar-specific marker glyph, keyed off the source calendar (not the
 *  event) — e.g. the birthday calendar draws a gift instead of the all-day sun. */
export type EventIcon = 'gift';

/** Per-calendar rendering hints tagged onto each event during expansion. */
export type EventSource = { color?: string; icon?: EventIcon };

/** A concrete, UI-facing calendar event (one occurrence for a recurring series). */
export type CalEvent = {
  /** Stable key for lists/markers: `uid:occurrenceStart` (recurrence-safe). */
  id: string;
  /** CalDAV object URL — used for update/delete. */
  url: string;
  /** Object etag — sent as If-Match on update/delete. */
  etag: string;
  uid: string;
  summary: string;
  start: Date;
  end: Date;
  allDay: boolean;
  location?: string;
  description?: string;
  /** The event's `URL` property (meeting link etc.) — NOT the CalDAV object URL. */
  link?: string;
  /** CONFERENCE / X-GOOGLE-CONFERENCE property — a joinable meeting URI. */
  conference?: string;
  /** True for occurrences of a recurring series (RRULE / RECURRENCE-ID). */
  recurring?: boolean;
  /** For a recurring occurrence: its original start (the RECURRENCE-ID it has
   *  or would have), unix seconds — how a scoped edit or delete addresses it,
   *  wherever an override has since moved it. */
  recurrenceStart?: number;
  /** True when a reminder is armed (the VEVENT carries a VALARM). */
  alarm?: boolean;
  /** Source calendar's CalDAV color (#RRGGBBAA), or undefined for the accent. */
  color?: string;
  /** Calendar-specific marker glyph (e.g. gift for the birthday calendar). */
  icon?: EventIcon;
  /** Original object ICS — required to edit while preserving unknown properties. */
  raw: string;
};

/** Repeat presets the editor can write; anything else reads as 'custom' (read-only). */
export type RecurrencePreset =
  | 'daily'
  | 'weekdays'
  | 'weekly'
  | 'monthly'
  | 'yearly';

/**
 * Recurrence to write as an RRULE. `until` (last possible day, inclusive, local)
 * and `count` are mutually exclusive; neither means the series repeats forever.
 */
export type RecurrenceInput = {
  preset: RecurrencePreset;
  until?: Date;
  count?: number;
};

/**
 * The event's single display reminder. Minutes BEFORE the (occurrence) start;
 * negative values fire after it — the all-day "morning of 9:00" preset is -540.
 */
export type AlarmInput = {
  offsetMinutes: number;
};

/** Fields for creating an event. */
export type EventInput = {
  summary: string;
  start: Date;
  end: Date;
  allDay: boolean;
  location?: string;
  description?: string;
  recurrence?: RecurrenceInput;
  alarm?: AlarmInput;
};

/**
 * Editable fields (whole-series; single-occurrence editing is deferred). Include only
 * fields that actually changed — untouched properties (e.g. an Apple TZID DTSTART)
 * are then left byte-identical. `allDay` describes how start/end should be written
 * and must be set whenever start/end are present. For `recurrence`/`alarm`,
 * null removes the RRULE / our VALARM; undefined leaves them untouched.
 */
export type EventChanges = Partial<
  Pick<
    EventInput,
    'summary' | 'start' | 'end' | 'location' | 'description' | 'allDay'
  >
> & {
  recurrence?: RecurrenceInput | null;
  alarm?: AlarmInput | null;
};
