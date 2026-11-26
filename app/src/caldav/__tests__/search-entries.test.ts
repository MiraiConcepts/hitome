import { searchEntries } from '../search-entries';

const object = (...vevents: string[][]) =>
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//test//EN',
    ...vevents.flatMap((lines) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT']),
    'END:VCALENDAR',
  ].join('\r\n');

const ms = (iso: string) => new Date(iso).getTime();

describe('searchEntries', () => {
  it('reads a single event: its words and its own time', () => {
    const [entry] = searchEntries(
      object([
        'UID:a',
        'DTSTART:20261112T093000Z',
        'DTEND:20261112T103000Z',
        'SUMMARY:Dentist',
        'LOCATION:Smile Dental',
        'DESCRIPTION:Bring the form',
      ]),
      '/cal/a.ics'
    );
    expect(entry).toEqual({
      key: '/cal/a.ics',
      summary: 'Dentist',
      location: 'Smile Dental',
      description: 'Bring the form',
      first: ms('2026-11-12T09:30:00Z'),
      last: ms('2026-11-12T10:30:00Z'),
    });
  });

  it('runs a series to its UNTIL, or without end', () => {
    const [until] = searchEntries(
      object([
        'UID:b',
        'DTSTART:20200107T180000Z',
        'DTEND:20200107T190000Z',
        'RRULE:FREQ=WEEKLY;UNTIL=20221227T180000Z',
        'SUMMARY:Gym',
      ]),
      'b'
    );
    expect(until.first).toBe(ms('2020-01-07T18:00:00Z'));
    expect(until.last).toBe(ms('2022-12-27T19:00:00Z'));

    const [forever] = searchEntries(
      object([
        'UID:c',
        'DTSTART:20200107T180000Z',
        'RRULE:FREQ=WEEKLY',
        'SUMMARY:Gym',
      ]),
      'c'
    );
    expect(forever.last).toBeNull();
  });

  it('reads a moved occurrence as an entry of its own', () => {
    const entries = searchEntries(
      object(
        [
          'UID:d',
          'DTSTART:20260105T090000Z',
          'RRULE:FREQ=DAILY;COUNT=5',
          'SUMMARY:Standup',
        ],
        [
          'UID:d',
          'RECURRENCE-ID:20260107T090000Z',
          'DTSTART:20270107T090000Z',
          'SUMMARY:Standup with Dennis',
        ]
      ),
      'd'
    );
    expect(entries.map((e) => e.summary)).toEqual([
      'Standup',
      'Standup with Dennis',
    ]);
    expect(entries[1].first).toBe(ms('2027-01-07T09:00:00Z'));
  });

  it('gives nothing for an object it cannot read', () => {
    expect(searchEntries('garbage', 'e')).toEqual([]);
  });
});
