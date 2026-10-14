import type { ComponentType } from 'react';

import {
  AlertCircleIcon,
  CalendarPlusIcon,
  CheckIcon,
  InfoCircleIcon,
  RefreshIcon,
  TelescopeIcon,
  TrashIcon,
  type IconProps,
} from '@/components/icons';

/**
 * Every message the month screen's bar shows, in one place so they keep one
 * vocabulary (agreed 2026-10-14): a change names the calendar it landed in
 * ("Added to Personal"); taking dates out of a repeating event is "Removed",
 * deleting a whole event "Deleted"; a failure is "<thing> <action> failed".
 * Without a calendar's name (its list not loaded), the event stands in.
 */
export const Messages = {
  added: (calendar?: string) =>
    calendar ? `Added to ${calendar}` : 'Event added',
  saved: (calendar?: string) =>
    calendar ? `Saved to ${calendar}` : 'Event saved',
  deleted: (calendar?: string) =>
    calendar ? `Deleted from ${calendar}` : 'Event deleted',
  /** One date, or this and every later one, of a repeating event. */
  removed: (calendar?: string) =>
    calendar ? `Removed from ${calendar}` : 'Event removed',
  restoreFailed: 'Event restore failed',
  changedElsewhere: 'Event changed elsewhere',
  eventCopied: 'Event copied',
  eventShareFailed: 'Event share failed',
  agendaCopied: 'Agenda copied',
  agendaSaved: 'Agenda saved',
  agendaShareFailed: 'Agenda share failed',
  /** Discover mode: an event ticked (going) or unticked, named (it goes to
   *  no other calendar, so there is none to name). */
  going: (event: string) => `Going to ${event}`,
  notGoing: (event: string) => `Not going to ${event}`,
  linkMissing: 'Event link missing',
  updateFailed: 'Event update failed',
} as const;

export type MessageSample = {
  message: string;
  icon: ComponentType<IconProps>;
  /** Shows an Undo, as the real one does. */
  undo?: boolean;
};

/** Every message once, in the order the app most often shows them: what
 *  Settings' "Show a test message" steps through. */
export const MESSAGE_SAMPLES: readonly MessageSample[] = [
  { message: Messages.added('Personal'), icon: CalendarPlusIcon },
  { message: Messages.saved('Personal'), icon: CheckIcon },
  { message: Messages.deleted('Personal'), icon: TrashIcon, undo: true },
  { message: Messages.removed('Personal'), icon: TrashIcon, undo: true },
  { message: Messages.restoreFailed, icon: AlertCircleIcon },
  { message: Messages.changedElsewhere, icon: RefreshIcon },
  { message: Messages.eventCopied, icon: CheckIcon },
  { message: Messages.eventShareFailed, icon: AlertCircleIcon },
  { message: Messages.agendaCopied, icon: CheckIcon },
  { message: Messages.agendaSaved, icon: CheckIcon },
  { message: Messages.agendaShareFailed, icon: AlertCircleIcon },
  { message: Messages.going('Aftersun'), icon: CheckIcon, undo: true },
  { message: Messages.notGoing('Aftersun'), icon: TelescopeIcon, undo: true },
  { message: Messages.linkMissing, icon: InfoCircleIcon },
  { message: Messages.updateFailed, icon: AlertCircleIcon },
];
