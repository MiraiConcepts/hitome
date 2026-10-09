// An in-memory stand-in for Android's calendar store, enough of it to run
// src/store/events against: calendars, events with exceptions (cancelled or
// changed occurrences), reminders, and the Instances view that expands a
// repeating event into occurrences the way the provider does.
//
// `synced` (the default) stands for events the sync app has already sent:
// they carry a _sync_id. Like Android, an exception only stands in for an
// occurrence of its series through original_sync_id, so for an unsynced
// series it replaces nothing.
import ICAL from 'ical.js';

import type { StoreRow, StoreValues } from '../../modules/calendar-store';

type Row = Record<string, string | number | null>;

const BASE = 'content://com.android.calendar';

export function fakeStore({ synced = true }: { synced?: boolean } = {}) {
  let nextId = 100;
  const calendars: Row[] = [
    {
      _id: 1,
      calendar_displayName: 'Home',
      calendar_color: -16776961,
      calendar_access_level: 700,
      visible: 1,
      sync_events: 1,
      account_type: 'bitfire.at.davdroid',
      isPrimary: 1,
    },
    {
      _id: 2,
      calendar_displayName: 'Birthdays',
      calendar_color: -65536,
      calendar_access_level: 700,
      visible: 1,
      sync_events: 1,
      account_type: 'bitfire.at.davdroid',
      isPrimary: 0,
    },
  ];
  const events: Row[] = [];
  const reminders: Row[] = [];

  const num = (v: unknown) => Number(v);
  const event = (id: string | number) =>
    events.find((e) => num(e._id) === num(id));

  function durationMs(row: Row): number {
    if (row.duration)
      return ICAL.Duration.fromString(String(row.duration)).toSeconds() * 1000;
    return num(row.dtend) - num(row.dtstart);
  }

  /** EXDATE text as the provider reads it: lines of comma-separated dates
   *  or UTC times (zone-prefixed lines are not needed here). */
  function exdates(text: unknown): number[] {
    if (typeof text !== 'string' || text === '') return [];
    return text.split('\n').flatMap((line) =>
      line.split(',').map((v) => {
        const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z)?$/.exec(v);
        if (!m) throw new Error(`fake store: bad EXDATE ${v}`);
        return Date.UTC(
          +m[1],
          +m[2] - 1,
          +m[3],
          +(m[4] ?? 0),
          +(m[5] ?? 0),
          +(m[6] ?? 0)
        );
      })
    );
  }

  /** The provider's Instances view: every occurrence overlapping [from, to). */
  function instances(from: number, to: number): Row[] {
    const out: Row[] = [];
    const cal = (id: unknown) => calendars.find((c) => c._id === num(id))!;
    const emit = (row: Row, begin: number, end: number) => {
      if (end <= from || begin >= to) return;
      const c = cal(row.calendar_id);
      out.push({
        ...row,
        begin,
        end,
        event_id: row._id,
        calendar_displayName: c.calendar_displayName,
        calendar_color: c.calendar_color,
        displayColor: c.calendar_color,
      });
    };
    for (const row of events) {
      if (row.original_id != null) {
        if (num(row.eventStatus) === 2) continue; // cancelled occurrence
        emit(row, num(row.dtstart), num(row.dtend));
        continue;
      }
      const length = durationMs(row);
      if (!row.rrule) {
        emit(row, num(row.dtstart), num(row.dtstart) + length);
        continue;
      }
      const allDay = num(row.allDay) === 1;
      const excluded = exdates(row.exdate);
      const d = new Date(num(row.dtstart));
      const start = allDay
        ? ICAL.Time.fromData({
            year: d.getUTCFullYear(),
            month: d.getUTCMonth() + 1,
            day: d.getUTCDate(),
            isDate: true,
          })
        : ICAL.Time.fromJSDate(d, true);
      const it = ICAL.Recur.fromString(String(row.rrule)).iterator(start);
      for (
        let next = it.next(), n = 0;
        next && n < 500;
        next = it.next(), n++
      ) {
        const at = allDay
          ? Date.UTC(next.year, next.month - 1, next.day)
          : next.toJSDate().getTime();
        if (at >= to) break;
        // An exception (changed or cancelled) stands in for this occurrence,
        // found by sync id as the provider does.
        const replaced = events.some(
          (e) =>
            e.original_sync_id != null &&
            e.original_sync_id === row._sync_id &&
            num(e.originalInstanceTime) === at
        );
        if (!replaced && !excluded.includes(at)) emit(row, at, at + length);
      }
    }
    return out.sort((a, b) => num(a.begin) - num(b.begin));
  }

  function rowsFor(
    uri: string,
    selection: string | null,
    args: string[] | null
  ): Row[] {
    const path = uri.slice(BASE.length);
    const when = /^\/instances\/when\/(\d+)\/(\d+)$/.exec(path);
    if (when) {
      const ids = (args ?? []).map(Number);
      return instances(Number(when[1]), Number(when[2])).filter(
        (r) =>
          ids.includes(num(r.calendar_id)) &&
          (r.eventStatus == null || num(r.eventStatus) !== 2)
      );
    }
    if (path === '/calendars') return calendars.filter((c) => c.visible === 1);
    const one = /^\/events\/(\d+)$/.exec(path);
    if (one) return [event(one[1])].filter((r): r is Row => Boolean(r));
    if (path === '/events' || path === '/events/') {
      const ids = (args ?? []).map(Number);
      if (selection?.startsWith('original_id'))
        return events.filter(
          (e) => e.original_id != null && ids.includes(num(e.original_id))
        );
      return events;
    }
    if (path === '/reminders') {
      const ids = (args ?? []).map(Number);
      return reminders.filter((r) => ids.includes(num(r.event_id)));
    }
    throw new Error(`fake store: no query for ${uri}`);
  }

  const store = {
    async query(
      uri: string,
      _projection: string[],
      selection: string | null,
      args: string[] | null
    ): Promise<StoreRow[]> {
      return rowsFor(uri, selection, args).map((r) => ({ ...r }));
    },
    async insert(uri: string, values: StoreValues): Promise<string> {
      const path = uri.slice(BASE.length);
      const id = nextId++;
      const clean = Object.fromEntries(
        Object.entries(values).map(([k, v]) => [
          k,
          typeof v === 'boolean' ? (v ? 1 : 0) : v,
        ])
      ) as Row;
      if (path === '/events') {
        events.push({
          _id: id,
          _sync_id: synced ? `remote-${id}` : null,
          original_id: null,
          original_sync_id: null,
          eventStatus: null,
          ...clean,
        });
        return String(id);
      }
      const exception = /^\/exception\/(\d+)$/.exec(path);
      if (exception) {
        const series = event(exception[1]);
        if (!series) throw new Error('no series');
        // Like the provider: a copy of the series for that occurrence, the
        // given values on top, no rule of its own.
        const at = num(clean.originalInstanceTime);
        events.push({
          ...series,
          rrule: null,
          duration: null,
          dtstart: at,
          dtend: at + durationMs(series),
          ...clean,
          _id: id,
          _sync_id: null,
          original_id: series._id,
          original_sync_id: series._sync_id ?? null,
        });
        return String(id);
      }
      if (path === '/reminders') {
        reminders.push({ _id: id, ...clean });
        return String(id);
      }
      throw new Error(`fake store: no insert for ${uri}`);
    },
    async update(
      uri: string,
      values: StoreValues,
      selection: string | null
    ): Promise<number> {
      const path = uri.slice(BASE.length);
      // Like the provider: the bare table with no selection is every row.
      if ((path === '/events' || path === '/events/') && selection === null) {
        for (const row of events) Object.assign(row, values);
        return events.length;
      }
      const one = /^\/events\/(\d+)$/.exec(path);
      const row = one && event(one[1]);
      if (!row) return 0;
      Object.assign(row, values);
      return 1;
    },
    async delete(
      uri: string,
      selection: string | null,
      args: string[] | null
    ): Promise<number> {
      const path = uri.slice(BASE.length);
      if ((path === '/events' || path === '/events/') && selection === null) {
        const count = events.length;
        events.length = 0;
        reminders.length = 0;
        return count;
      }
      const one = /^\/events\/(\d+)$/.exec(path);
      if (one) {
        const id = num(one[1]);
        const gone: number[] = [];
        for (let i = events.length - 1; i >= 0; i--)
          if (num(events[i]._id) === id || num(events[i].original_id) === id)
            gone.push(num(events.splice(i, 1)[0]._id));
        // The provider drops an event's reminders with it.
        for (let i = reminders.length - 1; i >= 0; i--)
          if (gone.includes(num(reminders[i].event_id))) reminders.splice(i, 1);
        return gone.length;
      }
      if (path === '/reminders') {
        const ids = (args ?? []).map(Number);
        const before = reminders.length;
        for (let i = reminders.length - 1; i >= 0; i--)
          if (ids.includes(num(reminders[i].event_id))) reminders.splice(i, 1);
        return before - reminders.length;
      }
      throw new Error(`fake store: no delete for ${uri}`);
    },
  };
  return { store, events, reminders };
}
