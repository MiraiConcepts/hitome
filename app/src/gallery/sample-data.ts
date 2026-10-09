// THROWAWAY gallery (see app/src/gallery/REVERT.md). Made-up events and
// calendars for the specimens: nothing here is read from a server or the
// phone's calendar store.
import type { CalEvent } from '@/caldav/types';
import type { CalendarChoice } from '@/data/events';
import type { WidgetCache } from '@/widget/types';
import { addDays, toDateString } from '@/utils/date';
import { toWidgetEvent } from '@/widget/select-upcoming';

export const SAMPLE_CALENDARS: CalendarChoice[] = [
  { url: 'gallery://personal/', name: 'Personal' },
  { url: 'gallery://work/', name: 'Work', color: '#5B9DFFFF' },
  { url: 'gallery://family/', name: 'Family', color: '#E11586FF' },
  {
    url: 'gallery://birthdays/',
    name: 'Birthdays',
    color: '#B933E1FF',
    icon: 'gift',
  },
];

const [PERSONAL, WORK, FAMILY, BIRTHDAYS] = SAMPLE_CALENDARS;

/** Today, at midnight, local. */
function today(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** A local time `days` from today. */
function at(days: number, hour = 0, minute = 0): Date {
  const d = today();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

const pad = (n: number) => String(n).padStart(2, '0');
const icsDate = (d: Date) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const icsDateTime = (d: Date) =>
  `${icsDate(d)}T${pad(d.getHours())}${pad(d.getMinutes())}00`;

type Spec = {
  id: string;
  summary: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  calendar?: CalendarChoice;
  location?: string;
  description?: string;
  link?: string;
  conference?: string;
  /** An RRULE value, e.g. 'FREQ=WEEKLY'. */
  rrule?: string;
  /** Minutes before the start, as the app writes it. */
  alarm?: number;
  /** An alarm another app wrote (absolute time): read-only in the editor. */
  foreignAlarm?: boolean;
};

/** A CalEvent with a real ICS body, so the editor reads its repeat and
 *  alert the way it reads a server's. */
function event(spec: Spec): CalEvent {
  const calendar = spec.calendar ?? PERSONAL;
  const allDay = spec.allDay ?? false;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//hitome gallery//EN',
    'BEGIN:VEVENT',
    `UID:${spec.id}`,
    'DTSTAMP:20261001T000000Z',
    allDay
      ? `DTSTART;VALUE=DATE:${icsDate(spec.start)}`
      : `DTSTART:${icsDateTime(spec.start)}`,
    allDay
      ? `DTEND;VALUE=DATE:${icsDate(spec.end)}`
      : `DTEND:${icsDateTime(spec.end)}`,
    `SUMMARY:${spec.summary}`,
    ...(spec.rrule ? [`RRULE:${spec.rrule}`] : []),
    ...(spec.alarm !== undefined
      ? [
          'BEGIN:VALARM',
          'ACTION:DISPLAY',
          'DESCRIPTION:Reminder',
          `TRIGGER:-PT${spec.alarm}M`,
          'END:VALARM',
        ]
      : []),
    ...(spec.foreignAlarm
      ? [
          'BEGIN:VALARM',
          'ACTION:DISPLAY',
          'DESCRIPTION:Reminder',
          `TRIGGER;VALUE=DATE-TIME:${icsDate(spec.start)}T010000Z`,
          'END:VALARM',
        ]
      : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return {
    id: `${spec.id}:${spec.start.getTime()}`,
    url: `${calendar.url}${spec.id}.ics`,
    etag: '"gallery"',
    uid: spec.id,
    summary: spec.summary,
    start: spec.start,
    end: spec.end,
    allDay,
    location: spec.location,
    description: spec.description,
    link: spec.link,
    conference: spec.conference,
    recurring: spec.rrule ? true : undefined,
    recurrenceStart: spec.rrule
      ? Math.floor(spec.start.getTime() / 1000)
      : undefined,
    alarm: spec.alarm !== undefined || spec.foreignAlarm ? true : undefined,
    color: calendar.color,
    icon: calendar.icon,
    raw: lines.join('\r\n'),
  };
}

const ZOOM = 'https://us02web.zoom.us/j/81234567890?pwd=gallery';

export const SAMPLE = {
  standup: event({
    id: 'standup',
    summary: 'Standup',
    start: at(0, 9, 30),
    end: at(0, 9, 45),
    calendar: WORK,
    conference: ZOOM,
    rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
    alarm: 5,
  }),
  dentist: event({
    id: 'dentist',
    summary: 'Dentist',
    start: at(0, 16, 30),
    end: at(0, 17, 15),
    location: 'Bright Smile Dental, 12 Orchard Road',
    alarm: 30,
  }),
  lunch: event({
    id: 'lunch',
    summary: 'Lunch with Mei 🍜',
    start: at(0, 12, 30),
    end: at(0, 13, 30),
    location: 'Tiong Bahru Market',
  }),
  planning: event({
    id: 'planning',
    summary:
      'Quarterly planning review with the whole product and design team (bring laptops and the draft roadmap)',
    start: at(1, 14, 0),
    end: at(1, 16, 0),
    calendar: WORK,
    location: 'Level 12 boardroom, Marina One West Tower',
    conference: ZOOM,
    link: 'https://docs.example.com/q4-roadmap',
    description:
      'Agenda:\n1. What shipped this quarter\n2. What slipped, and why\n3. Next quarter: three bets, no more\n\nPre-read is in the roadmap doc. Dial in on Zoom if you are travelling.',
    alarm: 10,
  }),
  holiday: event({
    id: 'holiday',
    summary: 'Public holiday',
    start: at(3),
    end: at(4),
    allDay: true,
    calendar: FAMILY,
  }),
  trip: event({
    id: 'trip',
    summary: 'Conference trip ✈️ Tokyo',
    start: at(5),
    end: at(9),
    allDay: true,
    calendar: WORK,
    location: 'Tokyo Big Sight',
  }),
  hackathon: event({
    id: 'hackathon',
    summary: 'Hackathon',
    start: at(-3, 18, 0),
    end: at(-1, 12, 0),
    calendar: WORK,
    link: 'https://hack.example.org',
  }),
  birthday: event({
    id: 'birthday-ada',
    summary: 'Ada’s birthday 🎂',
    start: at(2),
    end: at(3),
    allDay: true,
    calendar: BIRTHDAYS,
    rrule: 'FREQ=YEARLY',
  }),
  gym: event({
    id: 'gym',
    summary: 'Gym',
    start: at(-2, 7, 0),
    end: at(-2, 8, 0),
    rrule: 'FREQ=WEEKLY;COUNT=12',
    alarm: 60,
  }),
  bookClub: event({
    id: 'book-club',
    summary: 'Book club',
    start: at(4, 19, 30),
    end: at(4, 21, 0),
    calendar: FAMILY,
    location: 'Kinokuniya café',
    rrule: 'FREQ=MONTHLY;BYDAY=2TH',
    foreignAlarm: true,
  }),
  untitled: event({
    id: 'untitled',
    summary: '',
    start: at(1, 10, 0),
    end: at(1, 11, 0),
  }),
  allDayToday: event({
    id: 'school-run',
    summary: 'Kids’ sports day',
    start: at(0),
    end: at(1),
    allDay: true,
    calendar: FAMILY,
  }),
};

/** A day with more than a cell can show: a dozen events on one day. */
export const BUSY_DAY = 7;
const BUSY_TITLES = [
  'Breakfast meeting ☕',
  'Design crit',
  'Call with the bank',
  'Pick up dry cleaning',
  '1:1 with Sam',
  'Lunch',
  'Interview: frontend',
  'Pay rent',
  'Team retro',
  'Physio',
  'Dinner at Mum’s',
  'Late call with New York',
];
export const BUSY_EVENTS: CalEvent[] = BUSY_TITLES.map((summary, i) =>
  event({
    id: `busy-${i}`,
    summary,
    start: at(BUSY_DAY, 7 + i, i % 2 ? 30 : 0),
    end: at(BUSY_DAY, 8 + i, i % 2 ? 0 : 45),
    calendar: SAMPLE_CALENDARS[i % 3],
    ...(i === 4 ? { conference: ZOOM } : {}),
    ...(i === 9 ? { location: 'Novena Medical Centre' } : {}),
  })
);

/** Every occurrence of the repeating ones, a few weeks either side. */
function occurrences(base: CalEvent, everyDays: number, count: number) {
  return Array.from({ length: count }, (_, i) => {
    const shift = (i - Math.floor(count / 2)) * everyDays * 86_400_000;
    const start = new Date(base.start.getTime() + shift);
    return {
      ...base,
      id: `${base.uid}:${start.getTime()}`,
      start,
      end: new Date(base.end.getTime() + shift),
      recurrenceStart: Math.floor(start.getTime() / 1000),
    };
  });
}

/** What the sample month grid draws. */
export const GRID_EVENTS: CalEvent[] = [
  ...occurrences(SAMPLE.standup, 1, 21).filter(
    (e) => e.start.getDay() !== 0 && e.start.getDay() !== 6
  ),
  ...occurrences(SAMPLE.gym, 7, 7),
  SAMPLE.dentist,
  SAMPLE.lunch,
  SAMPLE.planning,
  SAMPLE.holiday,
  SAMPLE.trip,
  SAMPLE.hackathon,
  SAMPLE.birthday,
  SAMPLE.bookClub,
  SAMPLE.untitled,
  SAMPLE.allDayToday,
  ...BUSY_EVENTS,
];

/** One day's events, as the day list is handed them. */
export const TODAY_EVENTS: CalEvent[] = [
  SAMPLE.allDayToday,
  SAMPLE.standup,
  SAMPLE.lunch,
  SAMPLE.dentist,
];

export const TODAY = toDateString(today());
export const DAY = (n: number) => addDays(TODAY, n);

/** The widget's cached snapshot, for the Android preview. */
export function sampleWidgetCache(): WidgetCache {
  const pick = [
    SAMPLE.allDayToday,
    SAMPLE.standup,
    SAMPLE.lunch,
    SAMPLE.dentist,
    SAMPLE.planning,
    SAMPLE.birthday,
    SAMPLE.holiday,
    SAMPLE.bookClub,
  ];
  return {
    fetchedAt: new Date().toISOString(),
    events: pick.map(toWidgetEvent),
  };
}
