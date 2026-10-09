import {
  findMeetingLink,
  isMeetingLink,
  meetingLinkInText,
  normalizeLink,
  openableLink,
} from './meeting-link';

describe('normalizeLink', () => {
  it('prefixes https on scheme-less URLs and leaves schemed ones alone', () => {
    expect(normalizeLink('google.com')).toBe('https://google.com');
    expect(normalizeLink('https://zoom.us/j/1')).toBe('https://zoom.us/j/1');
    expect(normalizeLink('geo:1.2,3.4')).toBe('geo:1.2,3.4');
  });
});

describe('openableLink', () => {
  it('keeps web links and app schemes', () => {
    expect(openableLink('google.com')).toBe('https://google.com');
    expect(openableLink('zoommtg://zoom.us/join?confno=1')).toBe(
      'zoommtg://zoom.us/join?confno=1'
    );
    expect(openableLink('tel:+15551234')).toBe('tel:+15551234');
  });

  it('drops schemes that run code or reach into the device', () => {
    expect(openableLink('javascript://zoom.us/%0aalert(1)')).toBeUndefined();
    expect(openableLink('JavaScript:alert(1)')).toBeUndefined();
    expect(openableLink(' intent://x#Intent;end')).toBeUndefined();
    expect(openableLink('file:///sdcard/x')).toBeUndefined();
    expect(openableLink('content://com.x/y')).toBeUndefined();
  });

  it('never yields an unsafe Join link', () => {
    expect(
      findMeetingLink({ link: 'javascript://zoom.us/%0aalert(1)' })
    ).toBeUndefined();
  });
});

describe('isMeetingLink', () => {
  it('matches known meeting hosts and their subdomains', () => {
    expect(isMeetingLink('https://meet.google.com/abc-defg-hij')).toBe(true);
    expect(isMeetingLink('https://us02web.zoom.us/j/123?pwd=x')).toBe(true);
    expect(isMeetingLink('https://teams.microsoft.com/l/meetup-join/x')).toBe(
      true
    );
    expect(isMeetingLink('https://acme.webex.com/meet/addison')).toBe(true);
  });

  it('rejects ordinary URLs, including lookalikes', () => {
    expect(isMeetingLink('https://google.com')).toBe(false);
    expect(isMeetingLink('https://example.com/meet.google.com')).toBe(false);
    expect(isMeetingLink('https://notzoom.us.evil.com/j/1')).toBe(false);
  });
});

describe('findMeetingLink', () => {
  it('trusts the CONFERENCE property first', () => {
    expect(
      findMeetingLink({
        conference: 'https://meet.google.com/aaa',
        link: 'https://zoom.us/j/1',
      })
    ).toBe('https://meet.google.com/aaa');
  });

  it('uses the URL property when it points at a meeting host', () => {
    expect(findMeetingLink({ link: 'meet.google.com/abc' })).toBe(
      'https://meet.google.com/abc'
    );
    expect(findMeetingLink({ link: 'https://example.com' })).toBeUndefined();
  });

  it('falls back to scanning the description, stripping trailing punctuation', () => {
    expect(
      findMeetingLink({
        description:
          'Agenda attached. Join here: https://us02web.zoom.us/j/123?pwd=x. Bring notes.',
      })
    ).toBe('https://us02web.zoom.us/j/123?pwd=x');
    expect(
      findMeetingLink({ description: 'See https://example.com for docs' })
    ).toBeUndefined();
  });

  it('finds a meeting URL in the location before the description', () => {
    expect(
      findMeetingLink({
        location: 'Online (Google Meet): https://meet.google.com/twa-oqdz-rkn',
        description: 'Backup: https://zoom.us/j/1',
      })
    ).toBe('https://meet.google.com/twa-oqdz-rkn');
    expect(
      findMeetingLink({ location: 'Lau Pa Sat, 18 Raffles Quay' })
    ).toBeUndefined();
  });

  it('returns undefined when nothing matches', () => {
    expect(findMeetingLink({})).toBeUndefined();
  });
});

// A browser reads `\` as `/` in a web link and treats `name@` before the host
// as a login, so a string test on the text can be fooled about where a link
// really goes.
describe('links that disguise their host', () => {
  it('reads the host as a browser does, ending it at a backslash', () => {
    expect(isMeetingLink('https://evil.example\\.zoom.us/')).toBe(false);
    expect(isMeetingLink('https://evil.example\\@zoom.us/')).toBe(false);
    expect(
      meetingLinkInText('Join: https://evil.example\\.zoom.us/j/1')
    ).toBeUndefined();
    expect(
      findMeetingLink({ link: 'https://evil.example\\.zoom.us/j/1' })
    ).toBeUndefined();
  });

  it('refuses a link with a login before the host', () => {
    expect(
      openableLink('https://accounts.google.com@evil.example/')
    ).toBeUndefined();
    expect(openableLink('https://zoom.us:x@evil.example/j/1')).toBeUndefined();
    expect(isMeetingLink('https://zoom.us@evil.example/j/1')).toBe(false);
    expect(
      findMeetingLink({ conference: 'https://zoom.us@evil.example/j/1' })
    ).toBeUndefined();
    expect(
      meetingLinkInText('Join: https://meet.google.com@evil.example/x')
    ).toBeUndefined();
  });

  it('still opens links whose @ is not a login', () => {
    expect(openableLink('mailto:sam@example.com')).toBe(
      'mailto:sam@example.com'
    );
    expect(openableLink('https://example.com/u/@sam')).toBe(
      'https://example.com/u/@sam'
    );
    expect(isMeetingLink('https://zoom.us/j/1?who=a@b.c')).toBe(true);
    expect(isMeetingLink('https://ZOOM.US:443/j/1')).toBe(true);
  });
});

describe('meetingLinkInText', () => {
  it('strips a long run of trailing punctuation quickly', () => {
    const text = `https://zoom.us/j/1${'.'.repeat(100_000)}x`;
    const started = performance.now();
    expect(meetingLinkInText(`${text} https://zoom.us/j/2!!!`)).toBe(
      'https://zoom.us/j/1'.concat('.'.repeat(100_000), 'x')
    );
    expect(meetingLinkInText(`https://zoom.us/j/1${';'.repeat(100_000)}`)).toBe(
      'https://zoom.us/j/1'
    );
    expect(performance.now() - started).toBeLessThan(200);
  });
});
