import { expect, test, type Page } from "@playwright/test";

// Search end to end: the header's magnifier (and /) opens it; every typed
// word must start a word (accents ignored); a weekly event lists every date
// and the agenda opens at today; a hidden calendar's events are found,
// greyed; a cancelled one is crossed out; a result opens in the editor and
// closing it goes back to the results. Its own calendars ("Search" and
// "Search Hidden"), which no other spec touches.

const RADICALE = process.env.E2E_RADICALE_URL ?? "http://radicale:5232";
const AUTH = { Authorization: `Basic ${btoa("test:test")}` };

const pad = (n: number) => `${n}`.padStart(2, "0");
const now = new Date();
const icsTime = (d: Date) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}0000`;
const daysFromNow = (n: number, h = 9) =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate() + n, h);

function event(
  uid: string,
  summary: string,
  start: Date,
  extra: string[] = [],
) {
  const end = new Date(start.getTime() + 3_600_000);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//hitome e2e//EN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    "DTSTAMP:20261103T000000Z",
    `DTSTART:${icsTime(start)}`,
    `DTEND:${icsTime(end)}`,
    `SUMMARY:${summary}`,
    ...extra,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

async function calendar(collection: string, name: string) {
  const mk = await fetch(`${RADICALE}${collection}`, {
    method: "MKCALENDAR",
    headers: { "Content-Type": "application/xml; charset=utf-8", ...AUTH },
    body:
      '<?xml version="1.0" encoding="utf-8"?>' +
      '<C:mkcalendar xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">' +
      `<D:set><D:prop><D:displayname>${name}</D:displayname></D:prop></D:set>` +
      "</C:mkcalendar>",
  });
  // 405/409 = already there (a rerun against a live stack).
  expect(mk.ok || mk.status === 405 || mk.status === 409).toBe(true);
}

async function put(collection: string, uid: string, body: string) {
  const res = await fetch(`${RADICALE}${collection}${uid}.ics`, {
    method: "PUT",
    headers: { "Content-Type": "text/calendar; charset=utf-8", ...AUTH },
    body,
  });
  expect(res.ok).toBe(true);
}

test.beforeAll(async () => {
  await calendar("/test/e2e-search/", "Search");
  await calendar("/test/e2e-search-hidden/", "Search Hidden");
  // Weekly for the past two years and six weeks on: ended before month + 3,
  // where the other specs keep their own events.
  await put(
    "/test/e2e-search/",
    "search-gym",
    event("search-gym", "Searchgym", daysFromNow(-730, 18), [
      `RRULE:FREQ=WEEKLY;UNTIL=${icsTime(daysFromNow(45, 18))}`,
    ]),
  );
  // Six years back, with nothing between: search reads past the empty years.
  await put(
    "/test/e2e-search/",
    "search-cafe",
    event("search-cafe", "Café Searchlunch", daysFromNow(-6 * 365)),
  );
  await put(
    "/test/e2e-search/",
    "search-off",
    event("search-off", "Searchoff concert", daysFromNow(20, 20), [
      "STATUS:CANCELLED",
    ]),
  );
  await put(
    "/test/e2e-search-hidden/",
    "search-secret",
    event("search-secret", "Searchsecret", daysFromNow(10)),
  );
});

const input = (page: Page) => page.getByTestId("search-input");
const rows = (page: Page) => page.locator('[data-testid^="search-row-"]');

async function openSearch(page: Page) {
  await page.getByTestId("calendar-search").click({ timeout: 30_000 });
  await expect(input(page)).toBeFocused();
}

test("search: words, repeats, hidden, cancelled, open and back", async ({
  page,
}) => {
  await page.goto("/settings");
  await page
    .getByTestId("settings-calendar-role-Search Hidden-hidden")
    .click({ timeout: 30_000 });
  await page.goto("/");
  await openSearch(page);

  // A weekly event: every date, more than fill a screen, opened at today
  // (an upcoming date is in view, not the first one two years back).
  await input(page).fill("searchgym");
  await expect(rows(page).first()).toBeVisible({ timeout: 30_000 });
  expect(await rows(page).count()).toBeGreaterThan(12);
  await expect
    .poll(() =>
      page.getByTestId("search-results").evaluate((el) => el.scrollTop),
    )
    .toBeGreaterThan(0);

  // The start of a word, not the middle.
  await input(page).fill("earchgym");
  await expect(page.getByTestId("search-empty")).toBeVisible();

  // Accents ignored, every word needed, and empty years passed over.
  await input(page).fill("cafe searchl");
  await expect(rows(page)).toHaveCount(1, { timeout: 30_000 });
  await expect(rows(page).first()).toContainText("Café Searchlunch");

  // A hidden calendar's event is found, greyed.
  await input(page).fill("searchsecret");
  await expect(rows(page)).toHaveCount(1, { timeout: 30_000 });
  await expect(rows(page).first()).toHaveCSS("opacity", "0.5");

  // A cancelled one is crossed out.
  await input(page).fill("searchoff");
  await expect(rows(page)).toHaveCount(1, { timeout: 30_000 });
  await expect(
    rows(page).first().getByText("concert", { exact: false }),
  ).toHaveCSS("text-decoration-line", "line-through");

  // Open one, close it: back in the results, same words.
  await rows(page).first().click();
  await expect(page.getByTestId("event-editor")).toBeVisible();
  // The phone's sheet takes no Escape while it is still sliding up.
  await page.waitForTimeout(1_000);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("event-editor")).toHaveCount(0, {
    timeout: 15_000,
  });
  await expect(input(page)).toHaveValue("searchoff");
  await expect(rows(page)).toHaveCount(1);

  // Escape closes search; / opens it again.
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("search-screen")).toHaveCount(0);
  await page.keyboard.press("/");
  await expect(input(page)).toBeFocused();
});
