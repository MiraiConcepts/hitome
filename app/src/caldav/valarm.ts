// VALARM write/read — pure ical.js logic, no transport imports. The editor
// owns at most ONE alarm: the first DISPLAY alarm with a duration trigger
// relative to the start. Everything else (EMAIL alarms, absolute-time
// triggers, RELATED=END) is foreign and preserved untouched.
import ICAL from 'ical.js';

import { masterVevent } from './rrule';
import type { AlarmInput } from './types';

/** The alarm this editor may rewrite, or null. */
export function findOurAlarm(vevent: ICAL.Component): ICAL.Component | null {
  return (
    vevent.getAllSubcomponents('valarm').find((alarm) => {
      if (alarm.getFirstPropertyValue('action') !== 'DISPLAY') return false;
      const trigger = alarm.getFirstProperty('trigger');
      if (!trigger) return false;
      if (trigger.getParameter('related') === 'END') return false;
      return trigger.getFirstValue() instanceof ICAL.Duration;
    }) ?? null
  );
}

/**
 * Write (or remove, with null) the event's reminder. Replacing mutates only
 * the existing alarm's TRIGGER in place, so foreign props on it (REPEAT,
 * Apple ACKNOWLEDGED, X-*) survive. Removal is instance-based — a string
 * `removeSubcomponent('valarm')` would delete someone else's first alarm.
 */
export function applyAlarm(
  vevent: ICAL.Component,
  alarm: AlarmInput | null
): void {
  const ours = findOurAlarm(vevent);
  if (alarm === null) {
    if (ours) vevent.removeSubcomponent(ours);
    return;
  }
  const trigger = ICAL.Duration.fromSeconds(-alarm.offsetMinutes * 60);
  if (ours) {
    ours.updatePropertyWithValue('trigger', trigger);
    return;
  }
  const valarm = new ICAL.Component('valarm');
  valarm.addPropertyWithValue('action', 'DISPLAY');
  valarm.addPropertyWithValue('description', 'Reminder');
  valarm.addPropertyWithValue('trigger', trigger);
  vevent.addSubcomponent(valarm);
}

/**
 * The VEVENT that speaks for one occurrence: its own exception (RECURRENCE-ID)
 * when it has one, which carries that occurrence's reminder, else the series.
 * `recurrenceStart` is the occurrence's original start in Unix seconds
 * (CalEvent.recurrenceStart); without it, the series.
 */
function veventFor(
  ics: string,
  recurrenceStart?: number
): ICAL.Component | null {
  const vcalendar = new ICAL.Component(ICAL.parse(ics));
  if (recurrenceStart !== undefined) {
    const own = vcalendar.getAllSubcomponents('vevent').find((v) => {
      const id = v.getFirstPropertyValue('recurrence-id');
      return id instanceof ICAL.Time && id.toUnixTime() === recurrenceStart;
    });
    if (own) return own;
  }
  return masterVevent(vcalendar);
}

/**
 * Read an object's reminder into editor state. 'foreign' = alarms exist but
 * none is ours (absolute-time trigger, RELATED=END, non-DISPLAY) — shown
 * read-only, never rewritten.
 */
export function readAlarm(
  ics: string,
  recurrenceStart?: number
): AlarmInput | 'foreign' | null {
  const vevent = veventFor(ics, recurrenceStart);
  if (!vevent) return null;
  if (vevent.getAllSubcomponents('valarm').length === 0) return null;
  const ours = findOurAlarm(vevent);
  if (!ours) return 'foreign';
  const trigger = ours.getFirstPropertyValue('trigger') as ICAL.Duration;
  return { offsetMinutes: Math.round(-trigger.toSeconds() / 60) };
}

/**
 * When our reminder for an occurrence starting at `occStart` should fire, or
 * null (no editable alarm). Duration triggers are relative to each
 * occurrence's start (RELATED defaults to START). An occurrence with its own
 * exception rings by that exception's reminder.
 */
export function alarmTimeFor(
  ics: string,
  occStart: Date,
  recurrenceStart?: number
): Date | null {
  const vevent = veventFor(ics, recurrenceStart);
  if (!vevent) return null;
  const ours = findOurAlarm(vevent);
  if (!ours) return null;
  const trigger = ours.getFirstPropertyValue('trigger') as ICAL.Duration;
  return new Date(occStart.getTime() + trigger.toSeconds() * 1000);
}
