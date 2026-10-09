import { dayCellLabel } from './day-cell-label';

const date = (d: Date, year = false) =>
  d.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: year ? 'numeric' : undefined,
  });

describe('dayCellLabel', () => {
  const fri = new Date(2026, 9, 9);

  it('names the whole date, and nothing more for an empty day', () => {
    expect(
      dayCellLabel(fri, { isToday: false, count: 0, currentYear: 2026 })
    ).toBe(date(fri));
  });

  it('adds the year only when it is not this one', () => {
    const next = new Date(2027, 0, 4);
    const label = dayCellLabel(next, {
      isToday: false,
      count: 0,
      currentYear: 2026,
    });
    expect(label).toBe(date(next, true));
    expect(label).toContain('2027');
    expect(
      dayCellLabel(fri, { isToday: false, count: 0, currentYear: 2026 })
    ).not.toContain('2026');
  });

  it('says today', () => {
    expect(
      dayCellLabel(fri, { isToday: true, count: 0, currentYear: 2026 })
    ).toBe(`${date(fri)}, today`);
  });

  it('counts the events, one of them singular', () => {
    expect(
      dayCellLabel(fri, { isToday: false, count: 1, currentYear: 2026 })
    ).toBe(`${date(fri)}, 1 event`);
    expect(
      dayCellLabel(fri, { isToday: true, count: 12, currentYear: 2026 })
    ).toBe(`${date(fri)}, today, 12 events`);
  });
});
