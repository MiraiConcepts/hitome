import type { CalEvent } from '@/caldav/types';

import {
  createEvent,
  deleteEvent,
  fetchMonth,
  moveEvent,
  setStoreForTests,
  undoDelete,
  updateEvent,
} from '../events';
import { fakeStore } from '../fake-store.testing';

// The Android backend's operations (this / following / all, undo, move)
// against an in-memory calendar store that expands repeats and applies
// exceptions the way Android's does. On the phone these were also checked
// against real DAVx⁵ sync; here they run on every commit.

const HOME = 'store:1/';
const BIRTHDAYS = 'store:2/';
const FROM = new Date(2026, 9, 1);
const TO = new Date(2026, 11, 31);

let fake: ReturnType<typeof fakeStore>;
beforeEach(() => {
  fake = fakeStore();
  setStoreForTests(fake.store);
});
afterAll(() => setStoreForTests(null));

const at = (day: number, hour = 9) => new Date(2026, 9, day, hour, 0);
const titled = (all: CalEvent[], title: string) =>
  all.filter((e) => e.summary === title).map((e) => e.start.getDate());

async function weekly(title = 'Standup', count = 4) {
  // Mondays 5, 12, 19, 26 Oct.
  await createEvent(
    {
      summary: title,
      start: at(5),
      end: at(5, 10),
      allDay: false,
      recurrence: { preset: 'weekly', count },
      alarm: { offsetMinutes: 10 },
    },
    HOME
  );
  return fetchMonth(FROM, TO);
}

describe('store backend', () => {
  it('creates a one-off event where it was asked to', async () => {
    await createEvent(
      { summary: 'Dentist', start: at(7, 16), end: at(7, 17), allDay: false },
      HOME
    );
    const [e] = await fetchMonth(FROM, TO);
    expect(e.summary).toBe('Dentist');
    expect(e.start).toEqual(at(7, 16));
    expect(e.end).toEqual(at(7, 17));
    expect(e.url.startsWith(HOME)).toBe(true);
  });

  it('keeps an all-day span on its local days', async () => {
    await createEvent(
      {
        summary: 'Trip',
        start: new Date(2026, 9, 12),
        end: new Date(2026, 9, 14),
        allDay: true,
      },
      HOME
    );
    const [e] = await fetchMonth(FROM, TO);
    expect(e.allDay).toBe(true);
    expect(e.start).toEqual(new Date(2026, 9, 12));
    expect(e.end).toEqual(new Date(2026, 9, 15)); // exclusive
  });

  it('expands a repeat and carries its alert', async () => {
    const all = await weekly();
    expect(titled(all, 'Standup')).toEqual([5, 12, 19, 26]);
    expect(all.every((e) => e.alarm && e.recurring)).toBe(true);
  });

  it('edits this occurrence only', async () => {
    const all = await weekly();
    await updateEvent(all[1], { summary: 'Retro' }, 'this');
    const after = await fetchMonth(FROM, TO);
    expect(titled(after, 'Retro')).toEqual([12]);
    expect(titled(after, 'Standup')).toEqual([5, 19, 26]);
  });

  it('edits this and the following: a split with the rest of the COUNT', async () => {
    const all = await weekly();
    await updateEvent(all[2], { summary: 'Standup v2' }, 'following');
    const after = await fetchMonth(FROM, TO);
    expect(titled(after, 'Standup')).toEqual([5, 12]);
    expect(titled(after, 'Standup v2')).toEqual([19, 26]);
  });

  it('shifts the whole series, its exclusions moving with it', async () => {
    const all = await weekly();
    await deleteEvent(all[1], 'this'); // no 12 Oct
    const left = await fetchMonth(FROM, TO);
    await updateEvent(
      left[0],
      { start: at(5, 11), end: at(5, 12), allDay: false },
      'all'
    );
    const after = await fetchMonth(FROM, TO);
    expect(after.map((e) => [e.start.getDate(), e.start.getHours()])).toEqual([
      [5, 11],
      [19, 11],
      [26, 11],
    ]);
  });

  it('deletes this occurrence, and undo brings it back', async () => {
    const all = await weekly();
    await deleteEvent(all[2], 'this');
    expect(titled(await fetchMonth(FROM, TO), 'Standup')).toEqual([5, 12, 26]);
    await undoDelete(all[2], 'this');
    expect(titled(await fetchMonth(FROM, TO), 'Standup')).toEqual([
      5, 12, 19, 26,
    ]);
  });

  it('cancels an already-changed occurrence, and undo restores it', async () => {
    const all = await weekly();
    await updateEvent(all[1], { summary: 'Retro' }, 'this');
    const retro = (await fetchMonth(FROM, TO)).find(
      (e) => e.summary === 'Retro'
    )!;
    await deleteEvent(retro, 'this');
    expect(titled(await fetchMonth(FROM, TO), 'Retro')).toEqual([]);
    await undoDelete(retro, 'this');
    expect(titled(await fetchMonth(FROM, TO), 'Retro')).toEqual([12]);
  });

  it('deletes this and the following, and undo restores them', async () => {
    const all = await weekly();
    await deleteEvent(all[1], 'following');
    expect(titled(await fetchMonth(FROM, TO), 'Standup')).toEqual([5]);
    await undoDelete(all[1], 'following');
    expect(titled(await fetchMonth(FROM, TO), 'Standup')).toEqual([
      5, 12, 19, 26,
    ]);
  });

  it('deletes all, and undo puts the series back with its alert', async () => {
    const all = await weekly();
    await deleteEvent(all[0], 'all');
    expect(await fetchMonth(FROM, TO)).toEqual([]);
    await undoDelete(all[0], 'all');
    const back = await fetchMonth(FROM, TO);
    expect(titled(back, 'Standup')).toEqual([5, 12, 19, 26]);
    expect(back.every((e) => e.alarm)).toBe(true);
  });

  it('moves a whole series to another calendar', async () => {
    const all = await weekly();
    await moveEvent(all[0], BIRTHDAYS, {});
    const after = await fetchMonth(FROM, TO);
    expect(titled(after, 'Standup')).toEqual([5, 12, 19, 26]);
    expect(after.every((e) => e.url.startsWith(BIRTHDAYS))).toBe(true);
    expect(after.every((e) => e.icon === 'gift')).toBe(true);
    expect(fake.reminders.length).toBe(1);
  });

  it('refuses to write for an event that is not one of the store’s', async () => {
    const all = await weekly();
    const before = JSON.stringify(fake.events);
    const stray: CalEvent = {
      ...all[0],
      url: 'https://dav.example/home/standup.ics',
      etag: '"abc"',
    };
    await expect(deleteEvent(stray, 'all')).rejects.toThrow();
    await expect(deleteEvent(stray, 'this')).rejects.toThrow();
    await expect(
      updateEvent(stray, { summary: 'Everything' }, 'all')
    ).rejects.toThrow();
    await expect(
      updateEvent({ ...stray, recurring: false }, { summary: 'Everything' })
    ).rejects.toThrow();
    await expect(moveEvent(stray, BIRTHDAYS, {})).rejects.toThrow();
    expect(JSON.stringify(fake.events)).toBe(before);
    expect(titled(await fetchMonth(FROM, TO), 'Standup')).toEqual([
      5, 12, 19, 26,
    ]);
  });
});

describe('store backend, a series the sync app has not sent yet', () => {
  // No _sync_id: Android finds a series' exceptions by sync id only, so a
  // cancelled exception would take nothing out (and on the phone it made
  // the provider drop every occurrence of the series).
  beforeEach(() => {
    fake = fakeStore({ synced: false });
    setStoreForTests(fake.store);
  });

  it('an exception does not stand in for an occurrence', async () => {
    const all = await weekly();
    await fake.store.insert('content://com.android.calendar/exception/100', {
      originalInstanceTime: all[1].start.getTime(),
      eventStatus: 2,
    });
    expect(titled(await fetchMonth(FROM, TO), 'Standup')).toEqual([
      5, 12, 19, 26,
    ]);
  });

  it('deletes this occurrence with an EXDATE, and undo brings it back', async () => {
    const all = await weekly();
    await deleteEvent(all[2], 'this');
    expect(titled(await fetchMonth(FROM, TO), 'Standup')).toEqual([5, 12, 26]);
    expect(fake.events).toHaveLength(1);
    const [series] = fake.events;
    expect(series.exdate).toBe(
      new Date(all[2].start).toISOString().replace(/[-:]|\.\d+/g, '')
    );
    expect(series.dtstart).toBe(at(5).getTime());
    await deleteEvent(all[0], 'this');
    expect(titled(await fetchMonth(FROM, TO), 'Standup')).toEqual([12, 26]);
    await undoDelete(all[0], 'this');
    await undoDelete(all[2], 'this');
    expect(titled(await fetchMonth(FROM, TO), 'Standup')).toEqual([
      5, 12, 19, 26,
    ]);
  });

  it('moves an EXDATE with the whole series', async () => {
    const all = await weekly();
    await deleteEvent(all[1], 'this'); // no 12 Oct
    const left = await fetchMonth(FROM, TO);
    await updateEvent(
      left[0],
      { start: at(6, 11), end: at(6, 12), allDay: false },
      'all'
    );
    const after = await fetchMonth(FROM, TO);
    expect(after.map((e) => [e.start.getDate(), e.start.getHours()])).toEqual([
      [6, 11],
      [20, 11],
      [27, 11],
    ]);
  });

  it('deletes an all-day occurrence by its date', async () => {
    await createEvent(
      {
        summary: 'Gym',
        start: new Date(2026, 9, 6),
        end: new Date(2026, 9, 6),
        allDay: true,
        recurrence: { preset: 'weekly', count: 3 },
      },
      HOME
    );
    const all = await fetchMonth(FROM, TO);
    await deleteEvent(all[1], 'this');
    expect(titled(await fetchMonth(FROM, TO), 'Gym')).toEqual([6, 20]);
    expect(fake.events[0].exdate).toBe('20261013');
  });
});
