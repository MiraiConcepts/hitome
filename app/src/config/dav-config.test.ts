import { classifyConnectError, normalizeDavUrl } from './dav-config';

describe('normalizeDavUrl', () => {
  it('rejects nothing usable', () => {
    expect(normalizeDavUrl('')).toBeNull();
    expect(normalizeDavUrl('   ')).toBeNull();
    expect(normalizeDavUrl('https://')).toBeNull();
  });

  it('assumes https for a bare host', () => {
    expect(normalizeDavUrl('radicale.example')).toBe(
      'https://radicale.example/'
    );
  });

  it('keeps an explicit scheme, including http', () => {
    expect(normalizeDavUrl('http://192.168.1.4:5232/')).toBe(
      'http://192.168.1.4:5232/'
    );
  });

  it('adds the trailing slash discovery depends on', () => {
    expect(normalizeDavUrl('https://host:15000/dav')).toBe(
      'https://host:15000/dav/'
    );
  });

  it('trims what a paste drags in', () => {
    expect(normalizeDavUrl('  https://host/dav/  ')).toBe('https://host/dav/');
  });

  it('is idempotent', () => {
    const once = normalizeDavUrl('host/dav');
    expect(normalizeDavUrl(once!)).toBe(once);
  });
});

describe('classifyConnectError', () => {
  it("reads tsdav's 401 message", () => {
    expect(
      classifyConnectError(
        new Error(
          'Invalid credentials: PROPFIND https://host/dav/ returned 401 Unauthorized'
        )
      )
    ).toBe('unauthorized');
  });

  it('treats a forbidden response as a login problem too', () => {
    expect(classifyConnectError(new Error('HTTP 403 Forbidden'))).toBe(
      'unauthorized'
    );
  });

  it('recognises an account with no calendars', () => {
    expect(classifyConnectError(new Error('No CalDAV calendars found'))).toBe(
      'no-calendars'
    );
  });

  it("reads the browser's opaque preflight refusal", () => {
    expect(classifyConnectError(new TypeError('Failed to fetch'))).toBe(
      'blocked-by-browser'
    );
  });

  it('separates unreachable from rejected', () => {
    expect(classifyConnectError(new Error('Network request failed'))).toBe(
      'unreachable'
    );
  });

  it('does not guess at what it does not recognise', () => {
    expect(classifyConnectError(new Error('kaboom'))).toBe('unknown');
    expect(classifyConnectError('kaboom')).toBe('unknown');
  });
});
