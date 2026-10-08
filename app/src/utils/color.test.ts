import { mixHex, readableTextColor, rgbHex } from './color';

describe('readableTextColor', () => {
  it('picks light text on dark fills', () => {
    expect(readableTextColor('#000000')).toBe('#FFFFFF');
    expect(readableTextColor('#0060E0')).toBe('#FFFFFF'); // Firefox blue
  });

  it('picks dark text on light fills', () => {
    expect(readableTextColor('#FFFFFF')).toBe('#000000');
    expect(readableTextColor('#FFBD4F')).toBe('#000000'); // amber accent
  });

  it('ignores the alpha byte in #RRGGBBAA', () => {
    expect(readableTextColor('#ffbd4fff')).toBe('#000000');
    expect(readableTextColor('#f8708cff')).toBe(readableTextColor('#f8708c'));
  });

  it('expands #RGB shorthand', () => {
    expect(readableTextColor('#000')).toBe('#FFFFFF');
    expect(readableTextColor('#fff')).toBe('#000000');
  });

  it('falls back to dark on a malformed string', () => {
    expect(readableTextColor('nope')).toBe('#000000');
    expect(readableTextColor('')).toBe('#000000');
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
    for (const v of junk) expect(readableTextColor(v)).toBe('#000000');
  });

  it('rgbHex returns the input unchanged rather than throwing', () => {
    for (const v of junk) expect(() => rgbHex(v)).not.toThrow();
  });
});

describe('mixHex', () => {
  it('runs from the colour to the other one', () => {
    expect(mixHex('#FFBD4F', '#1C1B22', 0)).toBe('#ffbd4f');
    expect(mixHex('#FFBD4F', '#1C1B22', 1)).toBe('#1c1b22');
    expect(mixHex('#000000', '#FFFFFF', 0.5)).toBe('#808080');
  });

  it('reads shorthand and drops alpha', () => {
    expect(mixHex('#fff', '#00000080', 0.5)).toBe('#808080');
  });

  it('returns the colour unchanged when either is not hex', () => {
    expect(mixHex('red', '#000000', 0.5)).toBe('red');
    expect(mixHex('#FFBD4F', 'nope', 0.5)).toBe('#FFBD4F');
  });
});
