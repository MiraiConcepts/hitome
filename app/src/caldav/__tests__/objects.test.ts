import { fetchCalendarObjects } from 'tsdav';

import { expandObjects, isObjectUrl } from '../objects';

const event = (uid: string, start: string) =>
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//test//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    'DTSTAMP:20261001T000000Z',
    `DTSTART:${start}`,
    'DTEND:20261014T100000Z',
    'SUMMARY:Fine',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

const FROM = new Date('2026-10-01T00:00:00Z');
const TO = new Date('2026-11-01T00:00:00Z');

describe('expandObjects', () => {
  it('shows the good objects when another cannot be read', () => {
    const objects = [
      { url: 'a', etag: '1', data: event('good-1', '20261014T090000Z') },
      { url: 'b', etag: '2', data: 'garbage' },
      { url: 'c', etag: '3', data: event('bad-date', '2026XXXX') },
      {
        url: 'd',
        etag: '4',
        data: event('no-start', '20261014T090000Z').replace(
          'DTSTART:20261014T090000Z\r\n',
          ''
        ),
      },
      { url: 'e', etag: '5', data: undefined },
      { url: 'f', data: event('good-2', '20261015T090000Z') },
    ];
    const events = expandObjects(objects, FROM, TO, { color: '#123456' });
    expect(events.map((e) => e.uid)).toEqual(['good-1', 'good-2']);
    expect(events[0]).toMatchObject({ url: 'a', etag: '1', color: '#123456' });
    expect(events[1].etag).toBe('');
  });
});

describe('isObjectUrl', () => {
  // A calendar-query answer naming one object the way Radicale and most
  // clients do and one with no ".ics" (some clients name objects by UID).
  const multistatus = `<?xml version="1.0"?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:response><D:href>/dav/u/cal/one.ics</D:href><D:propstat><D:prop><D:getetag>"1"</D:getetag></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>
  <D:response><D:href>/dav/u/cal/7f3c-two</D:href><D:propstat><D:prop><D:getetag>"2"</D:getetag></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>
  <D:response><D:href>/dav/u/cal/</D:href><D:propstat><D:prop><D:getetag>"3"</D:getetag></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>
</D:multistatus>`;

  it('keeps every object, whatever it is named, and not the collection', async () => {
    const asked: string[] = [];
    const fetch = async (_url: unknown, init?: { body?: unknown }) => {
      const body = String(init?.body ?? '');
      for (const href of body.match(/\/dav\/u\/cal\/[^<]*/g) ?? [])
        asked.push(href);
      return new Response(multistatus, {
        status: 207,
        headers: { 'content-type': 'application/xml' },
      });
    };
    await fetchCalendarObjects({
      calendar: { url: 'https://x.example/dav/u/cal/' },
      urlFilter: isObjectUrl,
      fetch: fetch as unknown as typeof globalThis.fetch,
    });
    expect(asked).toEqual(['/dav/u/cal/one.ics', '/dav/u/cal/7f3c-two']);
  });

  it('turns away only empty and collection URLs', () => {
    expect(isObjectUrl('https://x.example/dav/u/cal/7f3c-two')).toBe(true);
    expect(isObjectUrl('https://x.example/dav/u/cal/one.ics')).toBe(true);
    expect(isObjectUrl('https://x.example/dav/u/cal/')).toBe(false);
    expect(isObjectUrl('')).toBe(false);
  });
});
