// The editor's state and behaviour, shell-agnostic: every field, validation,
// and the CalDAV write (diff-based on edit — untouched ICS properties stay
// byte-identical). Presentation is the components' job (event-editor-form)
// and the shells' (centered dialog vs bottom sheet); they only read this.
import { useEffect, useRef, useState } from 'react';

import {
  notificationsBlocked,
  requestPermissionIfNeeded,
} from '@/alarms/scheduler';
import {
  type CalendarChoice,
  calendarUrlOf,
  ConflictError,
  createEvent,
  defaultCalendarUrl,
  deleteEvent,
  type EditScope,
  listCalendars,
  moveEvent,
  updateEvent,
} from '@/data/events';
import { getDefaultAlert } from '@/config/alert-pref';
import { writeFailureMessage } from '@/config/dav-config';
import type {
  AlarmInput,
  CalEvent,
  EventChanges,
  RecurrenceInput,
} from '@/caldav/types';
import type { AlarmState } from '@/components/calendar/alarm-field';
import {
  CUSTOM_DAY_NOTE,
  endDayForAllDay,
  alarmEqual,
  initialFormState,
  isDirty,
  recurEqual,
  scopesFor,
} from '@/components/calendar/editor-state';
import type { RecurrenceState } from '@/components/calendar/recurrence-field';
import {
  addDays,
  parseDay,
  parseDayTime,
  toDateString,
  toTimeString,
} from '@/utils/date';
import { exclusive } from '@/utils/exclusive';

export type EditorResult =
  | 'created'
  | 'updated'
  | { deleted: CalEvent; scope: EditScope }
  | 'conflict';

type Options = {
  event: CalEvent | null;
  defaultDay: string;
  onDone: (result: EditorResult) => void;
  /** Open on the delete question ("which occurrences?") of a repeating event:
   *  the day list's trash button hands such an event over here. */
  askDeleteFirst?: boolean;
};

export type EventEditorController = ReturnType<typeof useEventEditor>;

/** The parts of the form a validation problem can point at. */
export type EditorField = 'title' | 'times' | 'repeat';

/** What the last Save or Delete came to, when it went wrong — tied to a
 *  field when it is that field's to fix, so it can show beside it. */
type EditorProblem = { field?: EditorField; text: string } | null;

/** The pending question for a repeating event: which action it is for, the
 *  answers on offer (no "this event" when the repeat rule itself changed, as
 *  one occurrence has no rule of its own; only "this event" for a change of
 *  day on a custom rule, see scopesFor), and a line saying why, if narrowed. */
type ScopeAsk = {
  action: 'save' | 'delete';
  scopes: EditScope[];
  note?: string;
};

const ALL_SCOPES: EditScope[] = ['this', 'following', 'all'];

export function useEventEditor({
  event,
  defaultDay,
  onDone,
  askDeleteFirst,
}: Options) {
  const [initial] = useState(() =>
    initialFormState(event, defaultDay, new Date(), getDefaultAlert())
  );

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
  // A repeating event's Save or Delete waiting on "which occurrences?".
  const [scopeAsk, setScopeAsk] = useState<ScopeAsk | null>(() =>
    askDeleteFirst && event?.recurring
      ? // A delete moves no day: every answer stays on offer.
        { action: 'delete', scopes: scopesFor(initial.recurrence, false) }
      : null
  );
  // A dismissal (Escape, a click or tap outside, Back, a drag) met a form
  // with changes: "Discard your changes?" waits in place of the action row.
  const [discardAsk, setDiscardAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  // Held while a Save or Delete runs. `busy` disables the buttons only once it
  // is drawn, so a second tap in the same frame would write a second time.
  const writing = useRef(false);
  const [alarmHint, setAlarmHint] = useState<string | null>(null);
  // The calendars to choose from and the selected one: where a new event is
  // created, or where an existing one lives (choosing another moves it).
  const [calendars, setCalendars] = useState<CalendarChoice[]>([]);
  const [calendarUrl, setCalendarUrl] = useState<string | undefined>(undefined);

  // Where the event started out, to tell a move from a stay.
  const [originalCalendarUrl, setOriginalCalendarUrl] = useState<
    string | undefined
  >(undefined);
  // The calendar selected when the list arrived, a new event's included: the
  // baseline a changed calendar is told from.
  const [loadedCalendarUrl, setLoadedCalendarUrl] = useState<
    string | undefined
  >(undefined);

  useEffect(() => {
    // Load the calendar list for the picker, selecting the primary calendar for
    // a new event or the event's own for an edit. On failure the picker just
    // doesn't show: a create falls back to the default calendar
    // (createEvent handles undefined) and an edit stays where it is.
    let alive = true;
    Promise.all([
      listCalendars(),
      event ? calendarUrlOf(event) : defaultCalendarUrl(),
    ])
      .then(([list, url]) => {
        if (!alive) return;
        setCalendars(list);
        setCalendarUrl(url);
        setLoadedCalendarUrl(url);
        if (event) setOriginalCalendarUrl(url);
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
            ? "Notifications are off, so reminders won't ring on this device."
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
    setEndDayState(
      endDayForAllDay(next, { startDay, startTime, endDay, endTime })
    );
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

  async function save(scope?: EditScope) {
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

    // An edit's changes, worked out before anything is written — a repeating
    // event asks which occurrences they reach first.
    // Diff-based: untouched fields stay byte-identical in the ICS (keeps
    // Apple TZID DTSTARTs — and foreign RRULEs/VALARMs — intact).
    const changes: EventChanges = {};
    if (event) {
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
      const moving =
        calendarUrl !== undefined &&
        originalCalendarUrl !== undefined &&
        calendarUrl !== originalCalendarUrl;
      if (moving) {
        // A move takes the whole object — every occurrence of a series goes
        // with it, so there is no "which occurrences?" to ask.
        setBusy(true);
        setProblem(null);
        try {
          await moveEvent(event, calendarUrl, changes);
          onDone('updated');
        } catch (err) {
          if (err instanceof ConflictError) {
            onDone('conflict');
            return;
          }
          setBusy(false);
          setProblem({ text: writeFailureMessage(err, 'move') });
        }
        return;
      }
      if (Object.keys(changes).length === 0) {
        onDone('updated');
        return;
      }
      if (event.recurring && !scope) {
        const scopes =
          changes.recurrence !== undefined
            ? ALL_SCOPES.filter((s) => s !== 'this')
            : scopesFor(initial.recurrence, startDay !== initial.startDay);
        setScopeAsk({
          action: 'save',
          scopes,
          note: scopes.includes('all') ? undefined : CUSTOM_DAY_NOTE,
        });
        return;
      }
    }

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

      await updateEvent(event, changes, scope);
      onDone('updated');
    } catch (err) {
      if (err instanceof ConflictError) {
        onDone('conflict');
        return;
      }
      setBusy(false);
      setProblem({ text: writeFailureMessage(err, 'save') });
    }
  }

  async function remove(scope?: EditScope) {
    if (!event) return;
    if (event.recurring && !scope) {
      setScopeAsk({
        action: 'delete',
        scopes: scopesFor(initial.recurrence, false),
      });
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      await deleteEvent(event, scope ?? 'all');
      onDone({ deleted: event, scope: scope ?? 'all' });
    } catch (err) {
      if (err instanceof ConflictError) {
        onDone('conflict');
        return;
      }
      setBusy(false);
      setProblem({ text: writeFailureMessage(err, 'delete') });
    }
  }

  // The day the title shows: the start, or the last one that parsed while a
  // web date input is mid-edit (its value is '' between keystrokes).
  const headerDay = parseDay(startDay) ? startDay : lastValidDay;

  const dirty = isDirty(
    { ...initial, calendarUrl: loadedCalendarUrl },
    {
      summary,
      allDay,
      startDay,
      startTime,
      endDay,
      endTime,
      location,
      description,
      recurrence,
      alarm,
      calendarUrl,
    }
  );

  /**
   * A way out other than Cancel (Escape, a click or tap outside, Back): steps
   * back one level and says whether the shell may close. An open question
   * goes first (the repeat one is cancelled, "Discard your changes?" means
   * keep editing); then a form with changes asks before dropping them.
   */
  function requestDismiss(): boolean {
    if (discardAsk) {
      setDiscardAsk(false);
      return false;
    }
    if (scopeAsk) {
      setScopeAsk(null);
      return false;
    }
    if (dirty) {
      setDiscardAsk(true);
      return false;
    }
    return true;
  }

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
    /** The event's calendar when the editor opened (edits only). */
    originalCalendarUrl,
    headerDay,
    // Not about one field (a failed write) — shown above the action bar.
    problem: problem && !problem.field ? problem.text : null,
    /** A validation problem with this field, shown under it. */
    problemFor: (field: EditorField) =>
      problem?.field === field ? problem.text : null,
    busy,
    /** The form differs from what it opened with. */
    dirty,
    /** "Discard your changes?" is showing. */
    discardAsk,
    requestDismiss,
    /** Ask "Discard your changes?" (a drag that was let go to close). */
    askDiscard: () => {
      setScopeAsk(null);
      setDiscardAsk(true);
    },
    /** Answer it with Keep editing: back to the form as it was. */
    keepEditing: () => setDiscardAsk(false),
    save: () => exclusive(writing, () => save()),
    remove: () => exclusive(writing, () => remove()),
    /** The open "which occurrences?" question, if any. */
    scopeAsk,
    /** Answer it: run the pending Save or Delete for that scope. */
    chooseScope: (scope: EditScope) => {
      const ask = scopeAsk;
      setScopeAsk(null);
      if (ask?.action === 'save') exclusive(writing, () => save(scope));
      else if (ask?.action === 'delete')
        exclusive(writing, () => remove(scope));
    },
    cancelScope: () => setScopeAsk(null),
  };
}
