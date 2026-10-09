/** The links the widget's taps open: deep links into this app. */

/** The scheme app.json registers ("hitome"). It was once `app:///`, a scheme
 *  the generated manifest only carried until a clean prebuild dropped it: the
 *  published widget's taps then resolved to nothing. */
export const APP_LINK = 'hitome:///';

/** An event, and its day for when the event is gone. */
export const eventLink = (day: string, eventId: string) =>
  `${APP_LINK}?day=${day}&event=${encodeURIComponent(eventId)}`;

/** A new event; the stamp keeps each tap's link distinct. */
export const newEventLink = (stamp: number) => `${APP_LINK}?new=${stamp}`;
