// Playwright global setup: seed the throwaway Radicale with deterministic
// fixtures. Dates are RELATIVE (current month + 3) so the suite stays valid on
// any run date. agenda.spec.ts derives the same dates independently.

const BASE = process.env.E2E_BASE_URL ?? 'http://e2e-proxy:8881';
const CAL_URL = `${BASE}/dav/test/e2e/`;

const pad = (n) => `${n}`.padStart(2, '0');
const icsDate = (d) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;

/** Floating local times (no TZID) — TZ is pinned container-wide by run.sh. */
function vevent({ uid, summary, start, end, allDay = false }) {
  const times = allDay
    ? [
        `DTSTART;VALUE=DATE:${icsDate(start)}`,
        `DTEND;VALUE=DATE:${icsDate(end)}`,
      ]
    : [
        `DTSTART:${icsDate(start)}T${pad(start.getHours())}${pad(start.getMinutes())}00`,
        `DTEND:${icsDate(end)}T${pad(end.getHours())}${pad(end.getMinutes())}00`,
      ];
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//hitome e2e//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${icsDate(new Date())}T000000Z`,
    `SUMMARY:${summary}`,
    ...times,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

async function waitForStack() {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const res = await fetch(`${BASE}/dav/`, {
        method: 'PROPFIND',
        headers: { Depth: '0' },
      });
      if (res.status < 500) return;
    } catch {
      // proxy/radicale still starting
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`e2e stack not reachable at ${BASE}`);
}

async function put(event) {
  const res = await fetch(`${CAL_URL}${event.uid}.ics`, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/calendar; charset=utf-8' },
    body: vevent(event),
  });
  if (!res.ok) {
    throw new Error(`seed PUT ${event.uid} failed (HTTP ${res.status})`);
  }
}

export default async function seed() {
  await waitForStack();

  const mk = await fetch(CAL_URL, { method: 'MKCALENDAR' });
  // 405/409 = collection already exists (rerun against a live stack) — fine.
  if (!mk.ok && mk.status !== 405 && mk.status !== 409) {
    throw new Error(`MKCALENDAR failed (HTTP ${mk.status})`);
  }

  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const target = (day, h = 0, min = 0) => new Date(y, m + 3, day, h, min);

  const events = [
    // Current month: enough filler BEFORE today that today's section starts
    // below the fold — makes the auto-scroll-to-today assertion meaningful.
    ...Array.from({ length: now.getDate() - 1 }, (_, i) => i + 1).flatMap(
      (day) => [
        {
          uid: `e2e-filler-${day}a`,
          summary: `🧪 Filler ${day}a`,
          start: new Date(y, m, day, 9, 0),
          end: new Date(y, m, day, 10, 0),
        },
        {
          uid: `e2e-filler-${day}b`,
          summary: `🧪 Filler ${day}b`,
          start: new Date(y, m, day, 14, 0),
          end: new Date(y, m, day, 15, 0),
        },
      ]
    ),
    {
      uid: 'e2e-today',
      summary: '🧪 E2E Today',
      start: new Date(y, m, now.getDate(), 15, 0),
      end: new Date(y, m, now.getDate(), 16, 0),
    },
    // Target month (now + 3): grouping, sort order, multi-day, scroll target.
    {
      uid: 'e2e-allday',
      summary: '🧪 E2E All-day',
      start: target(6),
      end: target(7),
      allDay: true,
    },
    {
      uid: 'e2e-morning',
      summary: '🧪 E2E Morning',
      start: target(6, 9, 0),
      end: target(6, 10, 0),
    },
    {
      uid: 'e2e-multiday',
      summary: '🧪 E2E Multi-day',
      start: target(8),
      end: target(11), // DTEND exclusive → shows under days 8, 9, 10
      allDay: true,
    },
    {
      uid: 'e2e-scroll-target',
      summary: '🧪 E2E Scroll target',
      start: target(20, 10, 0),
      end: target(20, 11, 0),
    },
    // 9 covered days (17–25) always cross a week boundary → the grid must
    // break the banner into ≥2 week segments.
    {
      uid: 'e2e-longspan',
      summary: '🧪 E2E Longspan',
      start: target(17),
      end: target(26), // DTEND exclusive
      allDay: true,
    },
    // Ten timed events on one day force the "+N more" overflow at any
    // plausible slot count. Named "Busy" (not "E2E") so the empty-month
    // assertion, which matches /🧪 E2E/, ignores them if day 27 bleeds into
    // the next month's first grid week.
    ...Array.from({ length: 10 }, (_, i) => ({
      uid: `e2e-busy-${i + 1}`,
      summary: `🧪 Busy ${i + 1}`,
      start: target(27, 8 + i, 0),
      end: target(27, 8 + i, 45),
    })),
    // Target + 1 month stays EMPTY (empty-month state).
  ];

  for (const event of events) await put(event);
  console.log(`seeded ${events.length} events into ${CAL_URL}`);
}
