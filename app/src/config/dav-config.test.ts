import {
  ConnectTimeoutError,
  NoCalendarsError,
  classifyConnectError,
  connectFailureMessage,
  normalizeDavUrl,
  type ConnectFailure,
  webConnectionProblem,
  writeFailureMessage,
} from './dav-config';

describe('normalizeDavUrl', () => {
  it('rejects nothing usable', () => {
    expect(normalizeDavUrl('')).toBeNull();
    expect(normalizeDavUrl('   ')).toBeNull();
    expect(normalizeDavUrl('https://')).toBeNull();
  });

  it('rejects text that is not an address', () => {
    expect(normalizeDavUrl('hello world')).toBeNull();
    expect(normalizeDavUrl('https://exa mple.com')).toBeNull();
  });

  it('rejects other schemes instead of putting https in front of them', () => {
    expect(normalizeDavUrl('ftp://host/dav/')).toBeNull();
    expect(normalizeDavUrl('webcal://host/cal.ics')).toBeNull();
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

// Every message below is one tsdav or a runtime actually produced, collected by
// pointing the connection check at a throwaway Radicale and at deliberately
// wrong addresses.
describe('classifyConnectError', () => {
  const tsdav401 =
    'Invalid credentials: PROPFIND https://host/dav/ returned 401 Unauthorized';

  it('asks for a login when none was given and the server wants one', () => {
    expect(classifyConnectError(new Error(tsdav401))).toBe('needs-login');
    expect(classifyConnectError(new Error(tsdav401), { hadLogin: false })).toBe(
      'needs-login'
    );
  });

  it('calls a refused login wrong when one was given', () => {
    expect(classifyConnectError(new Error(tsdav401), { hadLogin: true })).toBe(
      'unauthorized'
    );
  });

  it('keeps a forbidden response apart from a wrong password', () => {
    expect(
      classifyConnectError(new Error('HTTP 403 Forbidden'), { hadLogin: true })
    ).toBe('forbidden');
  });

  it('recognises an address that answers but is not CalDAV', () => {
    // A website, or a JSON API: tsdav finds no principal in the reply.
    expect(classifyConnectError(new Error('cannot find principalUrl'))).toBe(
      'not-caldav'
    );
    expect(classifyConnectError(new Error('cannot find homeUrl'))).toBe(
      'not-caldav'
    );
    expect(
      classifyConnectError(
        new Error('Collection query failed: 404 Not Found. ')
      )
    ).toBe('not-caldav');
  });

  it('recognises a login with no calendars behind it', () => {
    expect(classifyConnectError(new NoCalendarsError())).toBe('no-calendars');
    // Still recognised by message, should one arrive as a plain Error.
    expect(classifyConnectError(new Error('No CalDAV calendars found'))).toBe(
      'no-calendars'
    );
  });

  it('recognises a host name that does not resolve', () => {
    // Android, as seen on the phone for an address of just "sing".
    expect(
      classifyConnectError(
        new TypeError(
          'fetch failed: java.net.UnknownHostException: Unable to resolve host "sing": No address associated with hostname'
        )
      )
    ).toBe('no-such-host');
    // Bun / Node.
    expect(
      classifyConnectError(new TypeError('getaddrinfo ENOTFOUND nope.invalid'))
    ).toBe('no-such-host');
  });

  it('reads every runtime’s way of not reaching a host', () => {
    expect(
      classifyConnectError(
        new TypeError(
          'fetch failed: java.net.ConnectException: Failed to connect to /192.168.0.250:1'
        )
      )
    ).toBe('unreachable');
    expect(
      classifyConnectError(
        new TypeError(
          'fetch failed: java.net.NoRouteToHostException: No route to host'
        )
      )
    ).toBe('unreachable');
    expect(classifyConnectError(new TypeError('Network request failed'))).toBe(
      'unreachable'
    );
    expect(
      classifyConnectError(
        new TypeError(
          'Unable to connect. Is the computer able to access the url?'
        )
      )
    ).toBe('unreachable');
    expect(
      classifyConnectError(new Error('connect ECONNREFUSED 127.0.0.1:1'))
    ).toBe('unreachable');
  });

  it('recognises Android refusing plain http', () => {
    expect(
      classifyConnectError(
        new TypeError(
          'fetch failed: java.net.UnknownServiceException: CLEARTEXT communication to cal.example not permitted by network security policy'
        )
      )
    ).toBe('cleartext-blocked');
  });

  it('separates a certificate failure', () => {
    expect(
      classifyConnectError(
        new TypeError('unknown certificate verification error')
      )
    ).toBe('insecure');
    expect(
      classifyConnectError(
        new TypeError(
          'fetch failed: javax.net.ssl.SSLHandshakeException: java.security.cert.CertPathValidatorException: Trust anchor for certification path not found.'
        )
      )
    ).toBe('insecure');
    expect(
      classifyConnectError(
        new TypeError(
          'fetch failed: javax.net.ssl.SSLHandshakeException: Chain validation failed'
        )
      )
    ).toBe('insecure');
  });

  it('recognises the connection check’s own timeout', () => {
    expect(classifyConnectError(new ConnectTimeoutError())).toBe('timeout');
  });

  it("reads the browser's opaque preflight refusal", () => {
    expect(classifyConnectError(new TypeError('Failed to fetch'))).toBe(
      'blocked-by-browser'
    );
  });

  it('does not mistake a number inside other text for a status', () => {
    expect(classifyConnectError(new Error('event 14012 failed'))).toBe(
      'unknown'
    );
  });

  it('does not guess at what it does not recognise', () => {
    expect(classifyConnectError(new Error('kaboom'))).toBe('unknown');
    expect(classifyConnectError('kaboom')).toBe('unknown');
  });
});

describe('connectFailureMessage', () => {
  const all: ConnectFailure[] = [
    'bad-url',
    'needs-login',
    'unauthorized',
    'forbidden',
    'not-caldav',
    'no-such-host',
    'cleartext-blocked',
    'unreachable',
    'insecure',
    'timeout',
    'no-calendars',
    'blocked-by-browser',
    'unknown',
  ];

  it('never shows the library’s own wording for a recognised failure', () => {
    for (const failure of all.filter((f) => f !== 'unknown')) {
      const message = connectFailureMessage(
        failure,
        'cannot find principalUrl'
      );
      expect(message).not.toContain('principalUrl');
      expect(message).not.toContain('PROPFIND');
      expect(message.length).toBeGreaterThan(20);
    }
  });

  it('says what to do, not only what went wrong', () => {
    expect(connectFailureMessage('needs-login', '')).toMatch(/username/i);
    expect(connectFailureMessage('cleartext-blocked', '')).toContain(
      'https://'
    );
    expect(connectFailureMessage('timeout', '')).toContain('15 seconds');
    expect(connectFailureMessage('bad-url', '')).toContain(
      'https://your-server/dav/'
    );
  });

  it('strips the runtime’s wrapping from an unrecognised failure', () => {
    expect(
      connectFailureMessage(
        'unknown',
        'fetch failed: java.io.IOException: unexpected end of stream'
      )
    ).toBe('Couldn’t connect: unexpected end of stream');
  });

  it('frames an unrecognised failure instead of showing it bare', () => {
    expect(connectFailureMessage('unknown', 'kaboom')).toBe(
      'Couldn’t connect: kaboom'
    );
  });
});

describe('writeFailureMessage', () => {
  it('says an offline save was not saved, and that the draft is kept', () => {
    const message = writeFailureMessage(
      new TypeError('Network request failed'),
      'save'
    );
    expect(message).toMatch(/^Not saved. Can’t reach/);
    expect(message).toContain('still here');
  });

  it('names the login for a rejected write', () => {
    const err = new Error('The server rejected the saved login');
    err.name = 'AuthError';
    expect(writeFailureMessage(err, 'delete')).toMatch(
      /^Not deleted. The server rejected the login/
    );
  });

  it('keeps the server’s own words for anything else', () => {
    expect(
      writeFailureMessage(new Error('CalDAV update failed (HTTP 500)'), 'move')
    ).toBe('Not moved: CalDAV update failed (HTTP 500)');
  });
});

describe('webConnectionProblem', () => {
  it('reads the rethrown discovery 401 as a refused login', () => {
    const failure = classifyConnectError(
      new Error('Invalid credentials: PROPFIND https://x/dav/ returned 401')
    );
    expect(webConnectionProblem(failure, '').title).toBe(
      'Your login stopped working'
    );
  });

  it('never asks for a username or password', () => {
    const failures: ConnectFailure[] = [
      'needs-login',
      'unauthorized',
      'forbidden',
      'not-caldav',
      'no-calendars',
      'unreachable',
    ];
    for (const failure of failures) {
      const { body } = webConnectionProblem(failure, '');
      expect(body).not.toMatch(/username|password/i);
    }
  });

  it('uses no em or en dashes', () => {
    const failures: ConnectFailure[] = [
      'unauthorized',
      'not-caldav',
      'no-calendars',
      'timeout',
      'unknown',
    ];
    for (const failure of failures) {
      const { title, body } = webConnectionProblem(failure, 'boom');
      expect(`${title} ${body}`).not.toMatch(/[\u2013\u2014]/);
    }
  });

  it('reads a proxy’s 502 as the server being down', () => {
    const failure = classifyConnectError(
      new Error(
        'Calendar server unavailable: PROPFIND https://x/dav/ returned 502'
      )
    );
    expect(failure).toBe('unreachable');
    expect(webConnectionProblem(failure, '').title).toBe(
      'Can’t reach your calendar'
    );
  });

  it('keeps the readable end of an unknown failure', () => {
    expect(
      webConnectionProblem('unknown', 'fetch failed: something odd').body
    ).toBe('something odd');
  });
});
