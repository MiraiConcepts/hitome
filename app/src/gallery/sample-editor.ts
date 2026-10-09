// THROWAWAY gallery (see app/src/gallery/REVERT.md). A stand-in for
// useEventEditor with the same shape, so the editor's real parts
// (EventEditorHeader, EventEditorFields, EventEditorActions) can be drawn
// without the real controller's calendar reads and CalDAV writes. Save and
// Delete check the form the way the real one does, spin for a moment, and
// report what would have happened; nothing is written anywhere.
import { useRef, useState } from 'react';

import type { CalEvent } from '@/caldav/types';
import type { AlarmState } from '@/components/calendar/alarm-field';
import {
  endDayForAllDay,
  initialFormState,
} from '@/components/calendar/editor-state';
import type { RecurrenceState } from '@/components/calendar/recurrence-field';
import type {
  EditorField,
  EditorResult,
  EventEditorController,
} from '@/components/calendar/use-event-editor';
import type { EditScope } from '@/data/events';
import { exclusive } from '@/utils/exclusive';
import {
  addDays,
  parseDay,
  parseDayTime,
  toDateString,
  toTimeString,
} from '@/utils/date';

import { SAMPLE_CALENDARS } from './sample-data';

type ScopeAsk = {
  action: 'save' | 'delete';
  scopes: ('this' | 'following' | 'all')[];
  note?: string;
};

export type SampleEditorOptions = {
  event: CalEvent | null;
  defaultDay: string;
  onDone?: (result: EditorResult) => void;
  askDeleteFirst?: boolean;
  /** Open on the repeat question already asked (static specimens). */
  scopeAsk?: ScopeAsk;
  /** Open with a problem already shown. */
  problem?: { field?: EditorField; text: string };
  /** The notifications-off line under the alert chips. */
  alarmHint?: string | null;
  /** Start in the busy state (Save spinning). */
  busy?: boolean;
  /** A new event's alert, as settings would give it. */
  defaultAlert?: number | null;
};

/** How long the fake write spins before it reports. */
const FAKE_WRITE_MS = 900;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useSampleEditor({
  event,
  defaultDay,
  onDone = () => {},
  askDeleteFirst,
  scopeAsk: scopeAskInitial,
  problem: problemInitial,
  alarmHint = null,
  busy: busyInitial = false,
  defaultAlert = 10,
}: SampleEditorOptions): EventEditorController {
  const [initial] = useState(() =>
    initialFormState(event, defaultDay, new Date(), defaultAlert)
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
  const [alarm, setAlarm] = useState<AlarmState>(initial.alarm);
  const [problem, setProblem] = useState<{
    field?: EditorField;
    text: string;
  } | null>(problemInitial ?? null);
  const [scopeAsk, setScopeAsk] = useState<ScopeAsk | null>(
    scopeAskInitial ??
      (askDeleteFirst && event?.recurring
        ? { action: 'delete', scopes: ['this', 'following', 'all'] }
        : null)
  );
  const [busy, setBusy] = useState(busyInitial);
  const writing = useRef(false);
  const originalCalendarUrl = event
    ? (SAMPLE_CALENDARS.find((c) => event.url.startsWith(c.url))?.url ??
      SAMPLE_CALENDARS[0].url)
    : undefined;
  const [calendarUrl, setCalendarUrl] = useState<string | undefined>(
    originalCalendarUrl ?? SAMPLE_CALENDARS[0].url
  );

  const clear = (field: EditorField) =>
    setProblem((last) => (last?.field === field ? null : last));

  function moveStart(nextDay: string, nextTime: string) {
    clear('times');
    const oldStart = parseDayTime(startDay, startTime);
    const oldEnd = parseDayTime(endDay, endTime);
    const newStart = parseDayTime(nextDay, nextTime);
    if (allDay) {
      const a = parseDay(startDay);
      const b = parseDay(endDay);
      if (a && b && parseDay(nextDay))
        setEndDayState(
          addDays(nextDay, Math.round((b.getTime() - a.getTime()) / 86_400_000))
        );
    } else if (oldStart && oldEnd && newStart) {
      const end = new Date(
        newStart.getTime() + (oldEnd.getTime() - oldStart.getTime())
      );
      setEndDayState(toDateString(end));
      setEndTimeState(toTimeString(end));
    }
    setStartDay(nextDay);
    setStartTime(nextTime);
  }

  async function fakeWrite(result: EditorResult) {
    setBusy(true);
    setProblem(null);
    await wait(FAKE_WRITE_MS);
    setBusy(false);
    onDone(result);
  }

  async function save(scope?: EditScope) {
    if (!summary.trim()) {
      setProblem({ field: 'title', text: 'Add a title' });
      return;
    }
    const start = allDay
      ? parseDay(startDay)
      : parseDayTime(startDay, startTime);
    const end = allDay ? parseDay(endDay) : parseDayTime(endDay, endTime);
    if (!start || !end || (allDay ? end < start : end <= start)) {
      setProblem({
        field: 'times',
        text: allDay
          ? 'End date is before the start'
          : 'End must be after the start',
      });
      return;
    }
    if (
      recurrence.kind === 'preset' &&
      recurrence.end.type === 'count' &&
      recurrence.end.n < 1
    ) {
      setProblem({ field: 'repeat', text: 'Repeat count must be at least 1' });
      return;
    }
    if (event?.recurring && !scope) {
      setScopeAsk({ action: 'save', scopes: ['this', 'following', 'all'] });
      return;
    }
    await fakeWrite(event ? 'updated' : 'created');
  }

  async function remove(scope?: EditScope) {
    if (!event) return;
    if (event.recurring && !scope) {
      setScopeAsk({ action: 'delete', scopes: ['this', 'following', 'all'] });
      return;
    }
    await fakeWrite({ deleted: event, scope: scope ?? 'all' });
  }

  return {
    event,
    summary,
    setSummary: (next: string) => {
      setSummaryState(next);
      clear('title');
    },
    allDay,
    setAllDay: (next: boolean) => {
      clear('times');
      setAllDayState(next);
      if (alarm.kind === 'set') setAlarm({ kind: 'none' });
      setEndDayState(
        endDayForAllDay(next, { startDay, startTime, endDay, endTime })
      );
    },
    startDay,
    startTime,
    endDay,
    endTime,
    moveStart,
    setEndDay: (next: string) => {
      setEndDayState(next);
      clear('times');
    },
    setEndTime: (next: string) => {
      setEndTimeState(next);
      clear('times');
    },
    location,
    setLocation,
    description,
    setDescription,
    recurrence,
    setRecurrence: (next: RecurrenceState) => {
      setRecurrenceState(next);
      clear('repeat');
    },
    alarm,
    setAlarm,
    alarmHint,
    calendars: SAMPLE_CALENDARS,
    calendarUrl,
    setCalendarUrl,
    originalCalendarUrl,
    headerDay: parseDay(startDay) ? startDay : initial.startDay,
    problem: problem && !problem.field ? problem.text : null,
    problemFor: (field: EditorField) =>
      problem?.field === field ? problem.text : null,
    busy,
    save: () => exclusive(writing, () => save()),
    remove: () => exclusive(writing, () => remove()),
    scopeAsk,
    chooseScope: (scope: EditScope) => {
      const ask = scopeAsk;
      setScopeAsk(null);
      if (ask?.action === 'save') exclusive(writing, () => save(scope));
      else if (ask?.action === 'delete')
        exclusive(writing, () => remove(scope));
    },
    cancelScope: () => setScopeAsk(null),
    // The discard question is not drawn here: the shells close at once.
    dirty: false,
    discardAsk: false,
    requestDismiss: () => true,
    askDiscard: () => {},
    keepEditing: () => {},
  };
}
