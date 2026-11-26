import {
  createEvent,
  loadSearchIndex,
  setStoreForTests,
  updateEvent,
  fetchMonth,
} from '../events';
import { fakeStore } from '../fake-store.testing';
import { entryMatches, queryWords } from '@/utils/search';

// Search on the Android backend: every row read once, and the dates of the
// matching series read through the same Instances view the grid uses.

const HOME = 'store:1/';
const BIRTHDAYS = 'store:2/';
const at = (month0: number, day: number, hour = 9) =>
  new Date(2026, month0, day, hour, 0);

beforeEach(() => setStoreForTests(fakeStore().store));
afterAll(() => setStoreForTests(null));

describe('store search', () => {
  it('reads every row, and only the matching series dates', async () => {
    await createEvent(
      {
        summary: 'Dentist',
        location: 'Smile Dental',
        start: at(10, 12),
        end: at(10, 12, 10),
        allDay: false,
      },
      HOME
    );
    await createEvent(
      {
        summary: 'Gym',
        start: at(9, 5, 18),
        end: at(9, 5, 19),
        allDay: false,
        recurrence: { preset: 'weekly', count: 3 },
      },
      BIRTHDAYS
    );
    const index = await loadSearchIndex();
    expect(index.entries.map((e) => e.summary).sort()).toEqual([
      'Dentist',
      'Gym',
    ]);

    const words = queryWords('smile');
    const keys = new Set(
      index.entries.filter((e) => entryMatches(e, words)).map((e) => e.key)
    );
    const found = await index.occurrences(
      keys,
      new Date(2026, 0, 1),
      new Date(2027, 0, 1)
    );
    expect(found.map((e) => e.summary)).toEqual(['Dentist']);
  });

  it('finds a changed occurrence by its own words, under its series', async () => {
    await createEvent(
      {
        summary: 'Standup',
        start: at(9, 5),
        end: at(9, 5, 10),
        allDay: false,
        recurrence: { preset: 'weekly', count: 3 },
      },
      HOME
    );
    const [, second] = (
      await fetchMonth(new Date(2026, 9, 1), new Date(2026, 10, 1))
    ).filter((e) => e.summary === 'Standup');
    await updateEvent(second, { summary: 'Standup with Dennis' }, 'this');

    const index = await loadSearchIndex();
    const words = queryWords('dennis');
    const matched = index.entries.filter((e) => entryMatches(e, words));
    expect(matched).toHaveLength(1);
    const found = await index.occurrences(
      new Set(matched.map((e) => e.key)),
      new Date(2026, 0, 1),
      new Date(2027, 0, 1)
    );
    // Every date of the series comes back; the screen keeps the ones whose
    // own words match.
    expect(found.map((e) => e.summary).sort()).toEqual([
      'Standup',
      'Standup',
      'Standup with Dennis',
    ]);
  });
});
