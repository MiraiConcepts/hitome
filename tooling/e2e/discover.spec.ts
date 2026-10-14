import { expect, test, type Page } from "@playwright/test";

// Discover mode end to end: a discover calendar (Settings) stays off the
// grid; the discover button switches the grid to its events, where a tap
// opens the day's list and its box marks one going (TRANSP:OPAQUE on the
// server), on the calendar once switched back; unticking it in discover mode
// writes TRANSP:TRANSPARENT and takes it off again. A cancelled event already marked going is drawn crossed
// out. Its own calendar ("Discover"), in month + 8, which no other spec
// touches.

const RADICALE = process.env.E2E_RADICALE_URL ?? "http://radicale:5232";
const AUTH = { Authorization: `Basic ${btoa("test:test")}` };
const COLLECTION = "/test/e2e-discover/";
const DAV = `/dav${COLLECTION}`;

const pad = (n: number) => `${n}`.padStart(2, "0");
const now = new Date();
const day = (n: number, h = 0) =>
  new Date(now.getFullYear(), now.getMonth() + 8, n, h);
const dateString = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const icsTime = (d: Date) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}0000`;

/** An event as the feed writes it (radicale/feeds): free unless marked. */
function showing(
  uid: string,
  summary: string,
  start: Date,
  extra: string[] = ["TRANSP:TRANSPARENT"],
) {
  const end = new Date(start.getTime() + 2 * 3_600_000);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//hitome e2e//EN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    "DTSTAMP:20261012T024500Z",
    `DTSTART:${icsTime(start)}`,
    `DTEND:${icsTime(end)}`,
    `SUMMARY:${summary}`,
    `URL:https://example.com/${uid}`,
    ...extra,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

test.beforeAll(async () => {
  const mk = await fetch(`${RADICALE}${COLLECTION}`, {
    method: "MKCALENDAR",
    headers: { "Content-Type": "application/xml; charset=utf-8", ...AUTH },
    body:
      '<?xml version="1.0" encoding="utf-8"?>' +
      '<C:mkcalendar xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">' +
      "<D:set><D:prop><D:displayname>Discover</D:displayname></D:prop></D:set>" +
      "</C:mkcalendar>",
  });
  // 405/409 = already there (a rerun against a live stack).
  expect(mk.ok || mk.status === 405 || mk.status === 409).toBe(true);
  for (const [uid, body] of [
    ["discover-gig", showing("discover-gig", "Discover Gig", day(10, 20))],
    [
      "discover-called-off",
      showing("discover-called-off", "Discover Called Off", day(12, 19), [
        "TRANSP:OPAQUE",
        "STATUS:CANCELLED",
      ]),
    ],
  ]) {
    const put = await fetch(`${RADICALE}${COLLECTION}${uid}.ics`, {
      method: "PUT",
      headers: { "Content-Type": "text/calendar; charset=utf-8", ...AUTH },
      body,
    });
    expect(put.ok).toBe(true);
  }
});

const grid = (page: Page) => page.getByTestId("month-grid");

async function serverHas(page: Page, uid: string, line: string) {
  const res = await page.request.get(DAV);
  expect(res.ok()).toBe(true);
  const ics = await res.text();
  const event = ics
    .split("BEGIN:VEVENT")
    .find((block) => block.includes(`UID:${uid}`));
  return Boolean(event?.split(/\r?\n/).includes(line));
}

async function openMonth(page: Page) {
  await page.goto(`/?day=${dateString(day(1))}`);
  await expect(page.getByTestId("calendar-header-label")).toHaveText(
    day(1).toLocaleDateString("en-GB", { month: "short", year: "numeric" }),
    { timeout: 30_000 },
  );
}

test("discover mode: flip, tap to go, flip back", async ({ page }) => {
  // Make the Discover calendar a discover one.
  await page.goto("/settings");
  await page
    .getByTestId("settings-calendar-role-Discover-tray")
    .click({ timeout: 30_000 });

  await openMonth(page);
  const gig = () => grid(page).getByText("Discover Gig", { exact: true });
  // Off the calendar while unanswered; the cancelled one was marked going,
  // so it shows, crossed out.
  await expect(gig()).toHaveCount(0);
  const calledOff = grid(page).getByText("Discover Called Off", {
    exact: true,
  });
  await expect(calledOff).toBeVisible({ timeout: 30_000 });
  await expect(calledOff).toHaveCSS("text-decoration-line", "line-through");

  const discoverButton = page.getByTestId("calendar-discover");
  const going = () =>
    page.locator('[data-testid^="day-popover-going-"]').first();

  // Flip to discover: the gig is there to answer, the cancelled one is not.
  await page.getByTestId("calendar-discover").click();
  await expect(discoverButton).toHaveAttribute("aria-pressed", "true");
  await expect(gig()).toBeVisible();
  await expect(calledOff).toHaveCount(0);

  // A tap opens the day's list; its box marks the gig going, on the server
  // too. The list has no Add event in discover mode.
  await gig().click();
  await expect(page.getByTestId("day-popover")).toBeVisible();
  await expect(page.getByTestId("day-popover-add")).toHaveCount(0);
  await going().click();
  await expect(going()).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("Going to Discover Gig")).toBeVisible();
  await expect
    .poll(() => serverHas(page, "discover-gig", "TRANSP:OPAQUE"))
    .toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("day-popover")).toHaveCount(0);

  // Flip back: it is on the calendar now.
  await page.getByTestId("calendar-discover").click();
  await expect(discoverButton).toHaveAttribute("aria-pressed", "false");
  await expect(gig()).toBeVisible();

  // And off again: in discover mode, the box once more. Straight after the
  // last flip, while its days are still clearing: the tap waits for them.
  await page.getByTestId("calendar-discover").click();
  await expect(discoverButton).toHaveAttribute("aria-pressed", "true");
  await gig().click();
  await going().click();
  await expect(page.getByText("Not going to Discover Gig")).toBeVisible();
  await expect
    .poll(() => serverHas(page, "discover-gig", "TRANSP:TRANSPARENT"))
    .toBe(true);
  await page.keyboard.press("Escape");
  await page.getByTestId("calendar-discover").click();
  await expect(gig()).toHaveCount(0);
});
