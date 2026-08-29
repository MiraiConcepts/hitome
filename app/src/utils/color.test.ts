import { readableTextColor, rgbHex } from './color';

describe('readableTextColor', () => {
  it('picks light text on dark fills', () => {
    expect(readableTextColor('#000000')).toBe('#FFFFFF');
    expect(readableTextColor('#0060E0')).toBe('#FFFFFF'); // Firefox blue
  });

  it('picks dark text on light fills', () => {
    expect(readableTextColor('#FFFFFF')).toBe('#1C1B22');
    expect(readableTextColor('#FFBD4F')).toBe('#1C1B22'); // amber accent
  });

  it('ignores the alpha byte in #RRGGBBAA', () => {
    expect(readableTextColor('#ffbd4fff')).toBe('#1C1B22');
    expect(readableTextColor('#f8708cff')).toBe(readableTextColor('#f8708c'));
  });

  it('expands #RGB shorthand', () => {
    expect(readableTextColor('#000')).toBe('#FFFFFF');
    expect(readableTextColor('#fff')).toBe('#1C1B22');
  });

  it('falls back to dark on a malformed string', () => {
    expect(readableTextColor('nope')).toBe('#1C1B22');
    expect(readableTextColor('')).toBe('#1C1B22');
  });
});

describe('rgbHex', () => {
  it('drops the alpha byte of #RRGGBBAA', () => {
    expect(rgbHex('#f8708cff')).toBe('#f8708c');
    expect(rgbHex('#FFBD4FFF')).toBe('#ffbd4f');
  });

  it('passes #RRGGBB through (normalized to lowercase)', () => {
    expect(rgbHex('#FFBD4F')).toBe('#ffbd4f');
  });

  it('expands #RGB shorthand', () => {
    expect(rgbHex('#f0a')).toBe('#ff00aa');
  });

  it('returns a non-hex string unchanged', () => {
    expect(rgbHex('nope')).toBe('nope');
  });
});

// tsdav types calendarColor as a string, but an absent <calendar-color> parses
// to a truthy non-string. calendarColor() in caldav/client.ts now normalizes it
// away; these guard the parsers themselves so a bad value can never crash a
// render again (it used to throw "hex.replace is not a function").
describe('non-string input', () => {
  const junk = [{}, [], 0, null, undefined, true] as unknown as string[];

  it('readableTextColor falls back to the dark default', () => {
    for (const v of junk) expect(readableTextColor(v)).toBe('#1C1B22');
  });

  it('rgbHex returns the input unchanged rather than throwing', () => {
    for (const v of junk) expect(() => rgbHex(v)).not.toThrow();
  });
});
