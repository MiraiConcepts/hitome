import { durationLabel } from './duration';

const at = (h: number, m = 0, day = 6) => new Date(2026, 9, day, h, m);

describe('durationLabel', () => {
  it('says minutes under an hour', () => {
    expect(durationLabel(at(9), at(9, 45))).toBe('45 min');
    expect(durationLabel(at(9), at(9, 5))).toBe('5 min');
  });

  it('says whole hours, one of them singular', () => {
    expect(durationLabel(at(9), at(10))).toBe('1 hr');
    expect(durationLabel(at(11), at(13))).toBe('2 hrs');
  });

  it('keeps an hour and a part of one short', () => {
    expect(durationLabel(at(9), at(10, 30))).toBe('1h 30m');
    expect(durationLabel(at(9, 15), at(12, 5))).toBe('2h 50m');
  });

  it('counts days for anything a day or longer', () => {
    expect(durationLabel(at(9), at(9, 0, 7))).toBe('1 day');
    expect(durationLabel(at(9), at(9, 0, 9))).toBe('3 days');
  });

  it('says nothing for an all-day event or an empty span', () => {
    expect(durationLabel(at(0), at(0, 0, 7), true)).toBeNull();
    expect(durationLabel(at(9), at(9))).toBeNull();
    expect(durationLabel(at(10), at(9))).toBeNull();
  });
});
