import type { CalEvent } from '@/caldav/types';

import { trayLink } from './discover';

function ev(
  id: string,
  url: string,
  day: number,
  hours: [number, number],
  extra: Partial<CalEvent> = {}
): CalEvent {
  return {
    id,
    url: `${url}${id}`,
    etag: '',
    uid: id,
    summary: id,
    start: new Date(2026, 9, day, hours[0]),
    end: new Date(2026, 9, day, hours[1]),
    allDay: false,
    raw: '',
    ...extra,
  };
}

describe('trayLink', () => {
  it('prefers URL, then the first link in the notes', () => {
    expect(
      trayLink(ev('a', 't/', 3, [1, 2], { link: 'https://a.example/x' }))
    ).toBe('https://a.example/x');
    expect(
      trayLink(
        ev('b', 't/', 3, [1, 2], {
          description:
            'Book: https://filmhouse.sg/booknow/1813\nFilm: https://filmhouse.sg/film/195',
        })
      )
    ).toBe('https://filmhouse.sg/booknow/1813');
    expect(trayLink(ev('c', 't/', 3, [1, 2]))).toBeUndefined();
    expect(
      trayLink(ev('d', 't/', 3, [1, 2], { link: 'javascript:alert(1)' }))
    ).toBeUndefined();
  });
});
