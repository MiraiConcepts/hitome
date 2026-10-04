// The editor's state and behaviour, shell-agnostic: every field, validation,
// and the CalDAV write (diff-based on edit — untouched ICS properties stay
// byte-identical). Presentation is the components' job (event-editor-form)
// and the shells' (centered dialog vs bottom sheet); they only read this.
import { useEffect, useState } from 'react';

import {
  notificationsBlocked,
  requestPermissionIfNeeded,
} from '@/alarms/scheduler';
import {
  type CalendarChoice,
  ConflictError,
  createEvent,
  defaultCalendarUrl,
  deleteEvent,
  listCalendars,
  updateEvent,
} from '@/caldav/events';
import type {
  AlarmInput,
  CalEvent,
  EventChanges,
  RecurrenceInput,
} from '@/caldav/types';
import type { AlarmState } from '@/components/calendar/alarm-field';
import {
  alarmEqual,
  initialFormState,
  recurEqual,
} from '@/components/calendar/editor-state';
import type { RecurrenceState } from '@/components/calendar/recurrence-field';
import {
  addDays,
  parseDay,
  parseDayTime,
  toDateString,
  toTimeString,
} from '@/utils/date';

export type EditorResult =
  | 'created'
  | 'updated'
  | { deleted: CalEvent }
  | 'conflict';

type Options = {
  event: CalEvent | null;
  defaultDay: string;
  onDone: (result: EditorResult) => void;
};

export type EventEditorController = ReturnType<typeof useEventEditor>;

/** The parts of the form a validation problem can point at. */
export type EditorField = 'title' | 'times' | 'repeat';

/** What the last Save or Delete came to, when it went wrong — tied to a
 *  field when it is that field's to fix, so it can show beside it. */
type EditorProblem = { field?: EditorField; text: string } | null;

export function useEventEditor({ event, defaultDay, onDone }: Options) {
  const [initial] = useState(() => initialFormState(event, defaultDay));

  const [summary, setSummaryState] = useState(initial.summary);
  const [allDay, setAllDayState] = useState(initial.allDay);
  const [startDay, setStartDay] = useState(initial.startDay);
  const [startTime, setStartTime] = useState(initial.startTime);
  const [endDay, setEndDayState] = useState(initial.endDay);
  const [endTime, setEndTimeState] = useState(initial.endTime);
  const [location, setLocation] = useState(initial.location);
  const [description, setDescription] = useState(initial.description);
  const [recurrence, setRecurrenceState] = useState<RecurrenceState>(
    initial.recurrence
  );
  const [alarm, setAlarmState] = useState<AlarmState>(initial.alarm);
  const [lastValidDay, setLastValidDay] = useState(initial.startDay);
  const [problem, setProblem] = useState<EditorProblem>(null);
  const [busy, setBusy] = useState(false);
  const [alarmHint, setAlarmHint] = useState<string | null>(null);
  // Create-only: the calendars to choose from and the selected write target.
  const [calendars, setCalendars] = useState<CalendarChoice[]>([]);
  const [calendarUrl, setCalendarUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    // Load the calendar list for the create picker, defaulting the selection to
    // the primary calendar. On failure the picker just doesn't show and the
    // create falls back to the default calendar (createEvent handles undefined).
    if (event) return;
    let alive = true;
    Promise.all([listCalendars(), defaultCalendarUrl()])
      .then(([list, url]) => {
        if (!alive) return;
        setCalendars(list);
        setCalendarUrl(url);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [event]);

  function refreshAlarmHint() {
    // Best-effort — the alarm still saves to the event either way.
    notificationsBlocked()
      .then((blocked) =>
        setAlarmHint(
          blocked
            ? "Notifications are off — reminders won't ring on this device."
            : null
        )
      )
      .catch(() => {});
  }

  const prefilledAlarm = initial.alarm.kind === 'set';
  useEffect(() => {
    if (prefilledAlarm) refreshAlarmHint();
  }, [prefilledAlarm]);

  /** Drops a field's validation problem once that field is edited — the
   *  message answered, it should not linger until the next Save. */
  function clearProblem(field: EditorField) {
    setProblem((last) => (last?.field === field ? null : last));
  }

  function setSummary(next: string) {
    setSummaryState(next);
    clearProblem('title');
  }

  function setEndDay(next: string) {
    setEndDayState(next);
    clearProblem('times');
  }

  function setEndTime(next: string) {
    setEndTimeState(next);
    clearProblem('times');
  }

  function setRecurrence(next: RecurrenceState) {
    setRecurrenceState(next);
    clearProblem('repeat');
  }

  /** Start moved — keep the event's duration by shifting the end with it. */
  function moveStart(nextDay: string, nextTime: string) {
    clearProblem('times');
    if (parseDay(nextDay)) setLastValidDay(nextDay);
    if (allDay) {
      const oldStart = parseDay(startDay);
      const oldEnd = parseDay(endDay);
      if (oldStart && oldEnd && parseDay(nextDay)) {
        const days = Math.round(
          (oldEnd.getTime() - oldStart.getTime()) / 86_400_000
        );
        setEndDayState(addDays(nextDay, Math.max(0, days)));
      }
      setStartDay(nextDay);
      return;
    }
    const oldStart = parseDayTime(startDay, startTime);
    const oldEnd = parseDayTime(endDay, endTime);
    const newStart = parseDayTime(nextDay, nextTime);
    if (oldStart && oldEnd && newStart) {
      const newEnd = new Date(
        newStart.getTime() + (oldEnd.getTime() - oldStart.getTime())
      );
      setEndDayState(toDateString(newEnd));
      setEndTimeState(toTimeString(newEnd));
    }
    setStartDay(nextDay);
    setStartTime(nextTime);
  }

  function setAllDay(next: boolean) {
    clearProblem('times');
    setAllDayState(next);
    // The alarm preset sets differ; an incompatible pick is cleared.
    if (alarm.kind === 'set') setAlarmState({ kind: 'none' });
    if (parseDay(startDay) && endDay < startDay) setEndDayState(startDay);
  }

  function setAlarm(next: AlarmState) {
    setAlarmState(next);
    if (next.kind === 'set') {
      // First alarm = the user gesture we ask POST_NOTIFICATIONS on.
      requestPermissionIfNeeded()
        .catch(() => {})
        .finally(refreshAlarmHint);
    }
  }

  function resolveTimes(): { start: Date; end: Date } | null {
    if (allDay) {
      const start = parseDay(startDay);
      const end = parseDay(endDay);
      if (!start || !end || end < start) return null;
      return { start, end }; // inclusive end; the ICS layer writes DTEND +1d
    }
    const start = parseDayTime(startDay, startTime);
    const end = parseDayTime(endDay, endTime);
    if (!start || !end || end <= start) return null;
    return { start, end };
  }

  /** RecurrenceInput for the write, null for none, or a validation problem. */
  function resolveRecurrence(): RecurrenceInput | null | { error: string } {
    if (recurrence.kind !== 'preset') return null;
    const input: RecurrenceInput = { preset: recurrence.preset };
    if (recurrence.end.type === 'until') {
      const until = parseDay(recurrence.end.day);
      if (!until) return { error: 'Pick a repeat end date' };
      if (recurrence.end.day < startDay)
        return { error: 'Repeat end is before the start' };
      input.until = until;
    } else if (recurrence.end.type === 'count') {
      if (!Number.isInteger(recurrence.end.n) || recurrence.end.n < 1)
        return { error: 'Repeat count must be at least 1' };
      input.count = recurrence.end.n;
    }
    return input;
  }

  async function save() {
    const trimmed = summary.trim();
    if (!trimmed) {
      setProblem({ field: 'title', text: 'Add a title' });
      return;
    }
    const times = resolveTimes();
    if (!times) {
      setProblem({
        field: 'times',
        text: allDay
          ? 'End date is before the start'
          : 'End must be after the start',
      });
      return;
    }
    const rec = resolveRecurrence();
    if (rec && 'error' in rec) {
      setProblem({ field: 'repeat', text: rec.error });
      return;
    }
    const alarmInput: AlarmInput | null =
      alarm.kind === 'set' ? { offsetMinutes: alarm.offsetMinutes } : null;

    setBusy(true);
    setProblem(null);
    try {
      if (!event) {
        await createEvent(
          {
            summary: trimmed,
            ...times,
            allDay,
            location: location.trim() || undefined,
            description: description.trim() || undefined,
            ...(rec ? { recurrence: rec } : {}),
            ...(alarmInput ? { alarm: alarmInput } : {}),
          },
          calendarUrl
        );
        onDone('created');
        return;
      }

      // Diff-based changes: untouched fields stay byte-identical in the ICS
      // (keeps Apple TZID DTSTARTs — and foreign RRULEs/VALARMs — intact).
      const changes: EventChanges = {};
      if (trimmed !== event.summary) changes.summary = trimmed;
      if (location.trim() !== (event.location ?? ''))
        changes.location = location.trim();
      if (description.trim() !== (event.description ?? ''))
        changes.description = description.trim();
      const timesChanged =
        allDay !== initial.allDay ||
        startDay !== initial.startDay ||
        endDay !== initial.endDay ||
        (!allDay &&
          (startTime !== initial.startTime || endTime !== initial.endTime));
      if (timesChanged) {
        changes.start = times.start;
        changes.end = times.end;
        changes.allDay = allDay;
      }
      if (
        initial.recurrence.kind !== 'custom' &&
        !recurEqual(recurrence, initial.recurrence)
      ) {
        changes.recurrence = rec;
      }
      if (
        initial.alarm.kind !== 'foreign' &&
        !alarmEqual(alarm, initial.alarm)
      ) {
        changes.alarm = alarmInput;
      }

      if (Object.keys(changes).length > 0) await updateEvent(event, changes);
      onDone('updated');
    } catch (err) {
      if (err instanceof ConflictError) {
        onDone('conflict');
        return;
      }
      setBusy(false);
      setProblem({ text: err instanceof Error ? err.message : 'Save failed' });
    }
  }

  async function remove() {
    if (!event) return;
    setBusy(true);
    setProblem(null);
    try {
      await deleteEvent(event);
      onDone({ deleted: event });
    } catch (err) {
      if (err instanceof ConflictError) {
        onDone('conflict');
        return;
      }
      setBusy(false);
      setProblem({
        text: err instanceof Error ? err.message : 'Delete failed',
      });
    }
  }

  // The day the title shows: the start, or the last one that parsed while a
  // web date input is mid-edit (its value is '' between keystrokes).
  const headerDay = parseDay(startDay) ? startDay : lastValidDay;

  return {
    event,
    summary,
    setSummary,
    allDay,
    setAllDay,
    startDay,
    startTime,
    endDay,
    endTime,
    moveStart,
    setEndDay,
    setEndTime,
    location,
    setLocation,
    description,
    setDescription,
    recurrence,
    setRecurrence,
    alarm,
    setAlarm,
    alarmHint,
    calendars,
    calendarUrl,
    setCalendarUrl,
    headerDay,
    // Not about one field (a failed write) — shown above the action bar.
    problem: problem && !problem.field ? problem.text : null,
    /** A validation problem with this field, shown under it. */
    problemFor: (field: EditorField) =>
      problem?.field === field ? problem.text : null,
    busy,
    save,
    remove,
  };
}
