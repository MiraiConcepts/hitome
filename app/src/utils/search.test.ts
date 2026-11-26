import type { CalEvent } from '@/caldav/types';

import {
  agendaRows,
  eventMatches,
  markRanges,
  matchesFields,
  queryWords,
  upcomingIndex,
  yearAfter,
  yearBefore,
} from './search';

function ev(id: string, start: Date, extra: Partial<CalEvent> = {}): CalEvent {
  return {
    id,
    url: `/cal/${id}.ics`,
    etag: '',
    uid: id,
    summary: id,
    start,
    end: new Date(start.getTime() + 3_600_000),
    allDay: false,
    raw: '',
    ...extra,
  };
}

describe('matching', () => {
  it('matches the start of a word, not the middle', () => {
    const words = queryWords('den');
    expect(matchesFields(['Lunch with Dennis'], words)).toBe(true);
    expect(matchesFields(['Dentist'], words)).toBe(true);
    expect(matchesFields(['Golden hour'], words)).toBe(false);
  });

  it('needs every word, in any order', () => {
    expect(matchesFields(['Lunch with Dennis'], queryWords('den lunch'))).toBe(
      true
    );
    expect(matchesFields(['Lunch with Dennis'], queryWords('den tea'))).toBe(
      false
    );
  });

  it('ignores case, accents and apostrophes', () => {
    expect(matchesFields(['Café Ølsen'], queryWords('CAFE olsen'))).toBe(true);
    expect(matchesFields(["Dinner at O'Brien's"], queryWords('obrien'))).toBe(
      true
    );
    expect(matchesFields(['Dinner at O’Brien'], queryWords("o'bri"))).toBe(
      true
    );
  });

  it('splits on hyphens and other marks', () => {
    expect(matchesFields(['Check-in'], queryWords('in'))).toBe(true);
    expect(matchesFields(['team@work.com'], queryWords('work'))).toBe(true);
  });

  it('matches nothing for an empty query', () => {
    expect(queryWords('  , ')).toEqual([]);
    expect(matchesFields(['Anything'], [])).toBe(false);
  });

  it('looks in the title, place and notes', () => {
    const words = queryWords('smile');
    const at = new Date(2026, 10, 3, 9);
    expect(eventMatches(ev('a', at, { summary: 'Smile' }), words)).toBe(true);
    expect(eventMatches(ev('b', at, { location: 'Smile Dental' }), words)).toBe(
      true
    );
    expect(
      eventMatches(ev('c', at, { description: 'bring a smile' }), words)
    ).toBe(true);
    expect(eventMatches(ev('d', at, { summary: 'Dentist' }), words)).toBe(
      false
    );
  });
});

describe('markRanges', () => {
  it('marks what each word matched, in the text as written', () => {
    expect(markRanges('Lunch with Dennis', queryWords('den lun'))).toEqual([
      [0, 3],
      [11, 14],
    ]);
  });

  it('keeps accented letters whole', () => {
    // "é" written as one letter, matched by "e".
    expect(markRanges('Écoute', queryWords('ec'))).toEqual([[0, 2]]);
    // An apostrophe inside the match is marked with it.
    expect(markRanges("O'Brien", queryWords('obr'))).toEqual([[0, 4]]);
  });

  it('marks the longest word that fits', () => {
    expect(markRanges('Dentist', queryWords('d dent'))).toEqual([[0, 4]]);
  });
});

describe('which years to read', () => {
  const at = (y: number, m = 5) => new Date(y, m, 15).getTime();

  it('jumps over years nothing can be in', () => {
    const entries = [
      { first: at(1995), last: at(1995) },
      { first: at(2026), last: at(2026) },
    ];
    expect(yearBefore(entries, 2026)).toBe(1995);
    expect(yearBefore(entries, 1995)).toBeNull();
    expect(yearAfter(entries, 1995)).toBe(2026);
    expect(yearAfter(entries, 2026)).toBeNull();
  });

  it('reads every year of a series with no end, up to the last year', () => {
    const entries = [{ first: at(2020), last: null }];
    expect(yearBefore(entries, 2026)).toBe(2025);
    expect(yearBefore(entries, 2020)).toBeNull();
    expect(yearAfter(entries, 2026)).toBe(2027);
    expect(yearAfter(entries, 2100)).toBeNull();
  });

  it('reads the year a long span is in, from either side', () => {
    const entries = [{ first: at(2001), last: at(2010) }];
    expect(yearBefore(entries, 2026)).toBe(2010);
    expect(yearAfter(entries, 1990)).toBe(2001);
    expect(yearAfter(entries, 2005)).toBe(2006);
  });

  it('counts a span a day wider, for all-day dates at UTC midnight', () => {
    const entries = [
      { first: new Date(2025, 0, 1).getTime(), last: null as number | null },
    ];
    expect(yearBefore(entries, 2025)).toBe(2024);
  });
});

describe('agendaRows', () => {
  it('lists events by date, once each, under their month', () => {
    const a = ev('a', new Date(2026, 10, 12, 9));
    const b = ev('b', new Date(2026, 10, 3, 9));
    const c = ev('c', new Date(2026, 11, 1, 9));
    const rows = agendaRows([a, b, c, a]);
    expect(rows.map((r) => r.key)).toEqual([
      'month-2026-10',
      'b',
      'a',
      'month-2026-11',
      'c',
    ]);
  });

  it('opens at the first event not yet over', () => {
    const rows = agendaRows([
      ev('past', new Date(2026, 9, 1, 9)),
      ev('later', new Date(2026, 10, 12, 9)),
    ]);
    const now = new Date(2026, 10, 3);
    // The month heading above it, since it is the month's first.
    expect(upcomingIndex(rows, now)).toBe(2);
    expect(upcomingIndex(rows, new Date(2027, 0, 1))).toBe(rows.length - 1);
  });
});
