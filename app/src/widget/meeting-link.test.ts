import { findMeetingLink, isMeetingLink, normalizeLink } from './meeting-link';

describe('normalizeLink', () => {
  it('prefixes https on scheme-less URLs and leaves schemed ones alone', () => {
    expect(normalizeLink('google.com')).toBe('https://google.com');
    expect(normalizeLink('https://zoom.us/j/1')).toBe('https://zoom.us/j/1');
    expect(normalizeLink('geo:1.2,3.4')).toBe('geo:1.2,3.4');
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
