import type { CalEvent } from '@/caldav/types';

import {
  createEvent,
  deleteEvent,
  fetchMonth,
  setStoreForTests,
  updateEvent,
} from '../events';
import { fakeStore } from '../fake-store.testing';
import { localDaysBetween } from '../map';

// Moves and lengths across a daylight-saving change: Berlin springs forward
// on Sunday 29 March 2026, so that week is an hour short.

const HOME = 'store:1/';
const FROM = new Date(2026, 1, 20);
const TO = new Date(2026, 4, 31);

let fake: ReturnType<typeof fakeStore>;
let savedTz: string | undefined;
beforeAll(() => {
  savedTz = process.env.TZ;
  process.env.TZ = 'Europe/Berlin';
});
afterAll(() => {
  if (savedTz === undefined) delete process.env.TZ;
  else process.env.TZ = savedTz;
  setStoreForTests(null);
});
beforeEach(() => {
  fake = fakeStore();
  setStoreForTests(fake.store);
});

const sorted = async () =>
  (await fetchMonth(FROM, TO)).sort(
    (a, b) => a.start.getTime() - b.start.getTime()
  );
const days = (all: CalEvent[]) =>
  all.map((e) => `${e.start.getMonth() + 1}/${e.start.getDate()}`);

describe('store backend across a daylight-saving change', () => {
  it('runs in Berlin time', () => {
    expect(new Date(2026, 2, 30).getTimezoneOffset()).toBe(-120);
    expect(new Date(2026, 2, 23).getTimezoneOffset()).toBe(-60);
  });

  it('moves a whole all-day series by days, keeping its weekday', async () => {
    await createEvent(
      {
        summary: 'Mon',
        start: new Date(2026, 2, 2),
        end: new Date(2026, 2, 2),
        allDay: true,
        recurrence: { preset: 'weekly', count: 6 },
      },
      HOME
    );
    const occ = (await sorted()).find((e) => e.start.getDate() === 23)!;
    await updateEvent(
      occ,
      {
        start: new Date(2026, 2, 30),
        end: new Date(2026, 2, 30),
        allDay: true,
      },
      'all'
    );
    const after = await sorted();
    expect(days(after)).toEqual(['3/9', '3/16', '3/23', '3/30', '4/6', '4/13']);
    expect(after.every((e) => e.start.getDay() === 1)).toBe(true);
    expect(after.every((e) => localDaysBetween(e.start, e.end) === 1)).toBe(
      true
    );
  });

  it('moves a whole timed series keeping its clock time', async () => {
    await createEvent(
      {
        summary: 'Standup',
        start: new Date(2026, 2, 2, 10),
        end: new Date(2026, 2, 2, 11),
        allDay: false,
        recurrence: { preset: 'weekly', count: 6 },
      },
      HOME
    );
    const occ = (await sorted()).find((e) => e.start.getDate() === 23)!;
    expect(occ.start).toEqual(new Date(2026, 2, 23, 10));
    await updateEvent(
      occ,
      {
        start: new Date(2026, 2, 31, 10),
        end: new Date(2026, 2, 31, 11),
        allDay: false,
      },
      'all'
    );
    const [series] = fake.events;
    expect(series.dtstart).toBe(new Date(2026, 2, 10, 10).getTime());
    expect(series.duration).toBe('P3600S');
  });

  it('moves deleted occurrences with the series', async () => {
    await createEvent(
      {
        summary: 'Mon',
        start: new Date(2026, 2, 2),
        end: new Date(2026, 2, 2),
        allDay: true,
        recurrence: { preset: 'weekly', count: 6 },
      },
      HOME
    );
    const gone = (await sorted()).find((e) => e.start.getDate() === 30)!;
    await deleteEvent(gone, 'this');
    const occ = (await sorted()).find((e) => e.start.getDate() === 23)!;
    await updateEvent(
      occ,
      {
        start: new Date(2026, 2, 31),
        end: new Date(2026, 2, 31),
        allDay: true,
      },
      'all'
    );
    expect(days(await sorted())).toEqual([
      '3/10',
      '3/17',
      '3/24',
      '3/31',
      '4/14',
    ]);
  });

  it('keeps a two-day all-day series two days long when split', async () => {
    await createEvent(
      {
        summary: 'Two',
        start: new Date(2026, 2, 21),
        end: new Date(2026, 2, 22),
        allDay: true,
        recurrence: { preset: 'weekly', count: 4 },
      },
      HOME
    );
    const all = await sorted();
    await updateEvent(all[1], { summary: 'Two*' }, 'following');
    const after = await sorted();
    expect(after.map((e) => e.summary)).toEqual([
      'Two',
      'Two*',
      'Two*',
      'Two*',
    ]);
    expect(days(after)).toEqual(['3/21', '3/28', '4/4', '4/11']);
    expect(after.every((e) => localDaysBetween(e.start, e.end) === 2)).toBe(
      true
    );
  });

  it('keeps a two-day all-day event two days long when its repeat goes', async () => {
    await createEvent(
      {
        summary: 'R',
        start: new Date(2026, 2, 28),
        end: new Date(2026, 2, 29),
        allDay: true,
        recurrence: { preset: 'weekly', count: 2 },
      },
      HOME
    );
    const [first] = await sorted();
    await updateEvent(first, { recurrence: null }, 'all');
    const after = await sorted();
    expect(after).toHaveLength(1);
    expect(after[0].start).toEqual(new Date(2026, 2, 28));
    expect(after[0].end).toEqual(new Date(2026, 2, 30));
  });
});
