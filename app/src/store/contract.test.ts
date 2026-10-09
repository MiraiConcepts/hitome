import { rowId, URI } from './contract';

describe('store URIs', () => {
  it('address one row for a numeric id', () => {
    expect(URI.event(42)).toBe('content://com.android.calendar/events/42');
    expect(URI.event('7')).toBe('content://com.android.calendar/events/7');
    expect(URI.exceptions('7')).toBe(
      'content://com.android.calendar/exception/7'
    );
    expect(URI.instances(0, 1000)).toBe(
      'content://com.android.calendar/instances/when/0/1000'
    );
  });

  it('refuse an id that would address the whole table or something else', () => {
    for (const bad of ['', 'abc', '1; drop', '1/2', ' 1', '-1', '1.5'])
      expect(() => URI.event(bad)).toThrow();
    expect(() => URI.event(undefined as unknown as string)).toThrow();
    expect(() => URI.event(NaN)).toThrow();
    expect(() => URI.exceptions('')).toThrow();
    expect(() => rowId(null)).toThrow();
    expect(() => URI.instances(NaN, 1)).toThrow();
  });
});
