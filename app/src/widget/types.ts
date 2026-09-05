/**
 * Data shapes for the Android agenda widget. Events are cached as a slim,
 * JSON-safe snapshot (dates as ISO strings, no ICS payload) so the last-good
 * file stays small across headless runs.
 */
import type { EventIcon } from '@/caldav/types';

/** One upcoming event as the widget renders it. */
export type WidgetEvent = {
  /** CalEvent.id — `uid:occurrenceStart`, so an occurrence of a series is
   *  distinguishable from its siblings. Carried so a tapped row can deep-link
   *  to the event itself rather than to its month; the app re-reads the server
   *  before trusting it, since this snapshot can be half an hour old. */
  id: string;
  summary: string;
  /** ISO timestamp. */
  start: string;
  /** ISO timestamp; exclusive boundary for all-day events (like CalEvent). */
  end: string;
  allDay: boolean;
  location?: string;
  /** Non-meeting URL property, normalized to always carry a scheme. */
  link?: string;
  /** Joinable meeting URL (CONFERENCE prop, meeting-host URL prop, or a
   * meeting-host link found in the description) — rendered as a Join chip. */
  meetingLink?: string;
  /** Occurrence of a recurring series. Cached, but the widget row no longer
   * draws a marker for it. */
  recurring?: boolean;
  /** A reminder is armed (VALARM present). Cached, but the widget row no longer
   * draws a marker for it. */
  alarm?: boolean;
  /** Source calendar's CalDAV color (#RRGGBBAA) — tints the row's markers. */
  color?: string;
  /** Calendar-specific marker glyph — e.g. 'gift' swaps the all-day sun. */
  icon?: EventIcon;
};

/** Last successful fetch, persisted between headless widget runs. */
export type WidgetCache = {
  events: WidgetEvent[];
  /** ISO timestamp of the fetch — rendered as the "↻ HH:MM" freshness hint. */
  fetchedAt: string;
};
