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
});
