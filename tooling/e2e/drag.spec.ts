import { expect, test, type Page } from "@playwright/test";

// Drag and drop on the web month grid: a chip dragged to another day moves
// there, its time and length kept, with "Saved to <calendar>" and an Undo
// that puts it back; a plain click still opens it; a drop on its own day
// does nothing; a repeating one asks which dates; a discover calendar's
// events do not drag. Its own calendars ("Drag" and "Drag Discover") in
// month + 10, which no other spec touches (discover.spec has month + 8, and
// search.spec's weekly event ends before this).

const RADICALE = process.env.E2E_RADICALE_URL ?? "http://radicale:5232";
const AUTH = { Authorization: `Basic ${btoa("test:test")}` };
const CAL = "/test/e2e-drag/";
const TRAY = "/test/e2e-drag-tray/";

const pad = (n: number) => `${n}`.padStart(2, "0");
const now = new Date();
const day = (n: number, h = 0, m = 0) =>
  new Date(now.getFullYear(), now.getMonth() + 10, n, h, m);
const dateString = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const icsTime = (d: Date) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;

function event(
  uid: string,
  summary: string,
  start: Date,
  minutes: number,
  extra: string[] = [],
) {
  const end = new Date(start.getTime() + minutes * 60_000);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//hitome e2e//EN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    "DTSTAMP:20261106T000000Z",
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

/** One object as the server holds it now. */
/** A DTSTART or DTEND line at that local time: floating as seeded, or with
 *  the TZID the app writes its own changes in. */
const at = (name: string, d: Date) =>
  new RegExp(`^${name}(;TZID=[^:]+)?:${icsTime(d)}\\r?$`, "m");

async function onServer(uid: string, collection = CAL): Promise<string> {
  const res = await fetch(`${RADICALE}${collection}${uid}.ics`, {
    headers: AUTH,
  });
  expect(res.ok).toBe(true);
  return res.text();
}

test.beforeEach(async () => {
  // Put back fresh before each run, so a rerun starts where the first did.
  await calendar(CAL, "Drag");
  await calendar(TRAY, "Drag Discover");
  await put(
    CAL,
    "drag-dentist",
    event("drag-dentist", "Dragdentist", day(10, 9, 30), 75),
  );
  await put(
    CAL,
    "drag-weekly",
    event("drag-weekly", "Dragweekly", day(3, 18), 60, [
      "RRULE:FREQ=WEEKLY;COUNT=4",
    ]),
  );
  await put(TRAY, "drag-gig", event("drag-gig", "Draggig", day(14, 20), 120));
});

const grid = (page: Page) => page.getByTestId("month-grid");
const chip = (page: Page, title: string) =>
  grid(page).getByText(title, { exact: true });

async function openMonth(page: Page) {
  await page.goto(`/?day=${dateString(day(1))}`);
  await expect(page.getByTestId("calendar-header-label")).toHaveText(
    day(1).toLocaleDateString("en-GB", { month: "short", year: "numeric" }),
    { timeout: 30_000 },
  );
}

/** Take hold of the chip's middle and go to the middle of a day cell, in
 *  steps, as a hand does; `release` false leaves the mouse held. */
async function drag(page: Page, title: string, toDay: Date, release = true) {
  // Measured again until both are there: the month may be reloading under
  // them (an Undo's save lands just after the event is already back).
  const boxes = async () => ({
    from: await chip(page, title).first().boundingBox(),
    to: await page.getByTestId(`day-cell-${dateString(toDay)}`).boundingBox(),
  });
  let found = await boxes();
  await expect
    .poll(async () => {
      found = await boxes();
      return Boolean(found.from && found.to);
    })
    .toBe(true);
  const { from, to } = found;
  if (!from || !to) throw new Error("chip or day not on screen");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
    steps: 12,
  });
  if (release) await page.mouse.up();
}

test("drag: move, undo, click, own day, repeating, discover", async ({
  page,
}) => {
  await page.goto("/settings");
  await page
    .getByTestId("settings-calendar-role-Drag Discover-tray")
    .click({ timeout: 30_000 });
  await openMonth(page);
  await expect(chip(page, "Dragdentist")).toBeVisible({ timeout: 30_000 });

  // The server's answer to the save is held back, to see what shows first.
  let answer = () => {};
  const held = new Promise<void>((resolve) => (answer = resolve));
  await page.route("**/dav/**", async (route) => {
    if (route.request().method() === "PUT") await held;
    await route.continue();
  });
  const inDay = (d: Date) =>
    page
      .getByTestId(`day-cell-${dateString(d)}`)
      .locator("..")
      .getByText("Dragdentist", { exact: true });

  // While dragged: the copy follows, the day under it is framed.
  await drag(page, "Dragdentist", day(12), false);
  await expect(page.getByTestId("drag-copy")).toBeVisible();
  await expect(
    page.getByTestId(`drop-target-${dateString(day(12))}`),
  ).toBeVisible();
  await page.mouse.up();
  await expect(page.getByTestId("drag-copy")).toHaveCount(0);

  // On the new day at once, before the server has said a word.
  await expect(inDay(day(12))).toBeVisible();
  await expect(inDay(day(10))).toHaveCount(0);
  await expect(page.getByText("Saved to Drag")).toHaveCount(0);
  answer();
  // Lets the held save through before the hold comes off.
  await page.unrouteAll({ behavior: "wait" });

  // Moved two days, its time and length kept; nothing opened.
  await expect(page.getByText("Saved to Drag")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId("event-editor")).toHaveCount(0);
  await expect
    .poll(() => onServer("drag-dentist"))
    .toMatch(at("DTSTART", day(12, 9, 30)));
  expect(await onServer("drag-dentist")).toMatch(at("DTEND", day(12, 10, 45)));

  // Undo puts it back.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect
    .poll(() => onServer("drag-dentist"))
    .toMatch(at("DTSTART", day(10, 9, 30)));
  await expect(
    page
      .getByTestId(`day-cell-${dateString(day(10))}`)
      .locator("..")
      .getByText("Dragdentist", { exact: true }),
  ).toBeVisible({ timeout: 30_000 });

  // A drop on its own day: nothing written, nothing opened.
  await drag(page, "Dragdentist", day(10));
  await expect(page.getByTestId("event-editor")).toHaveCount(0);
  await expect(page.getByText("Saved to Drag")).toHaveCount(0);
  expect(await onServer("drag-dentist")).toMatch(at("DTSTART", day(10, 9, 30)));

  // A plain click still opens it.
  await chip(page, "Dragdentist").click();
  await expect(page.getByTestId("event-editor")).toBeVisible();
  // The phone's sheet takes no Escape while it is still sliding up.
  await page.waitForTimeout(1_000);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("event-editor")).toHaveCount(0, {
    timeout: 15_000,
  });

  // A repeating one asks which dates; Cancel leaves it be.
  const weekly = page
    .getByTestId(`day-cell-${dateString(day(10))}`)
    .locator("..");
  await expect(weekly.getByText("Dragweekly", { exact: true })).toBeVisible();
  const fromBox = await weekly
    .getByText("Dragweekly", { exact: true })
    .boundingBox();
  const toBox = await page
    .getByTestId(`day-cell-${dateString(day(11))}`)
    .boundingBox();
  if (!fromBox || !toBox) throw new Error("weekly or day not on screen");
  const dropWeekly = async () => {
    await page.mouse.move(
      fromBox.x + fromBox.width / 2,
      fromBox.y + fromBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      toBox.x + toBox.width / 2,
      toBox.y + toBox.height / 2,
      {
        steps: 12,
      },
    );
    await page.mouse.up();
    await expect(page.getByTestId("move-scope")).toBeVisible();
  };
  await dropWeekly();
  await page.getByTestId("move-scope-cancel").click();
  await expect(page.getByTestId("move-scope")).toHaveCount(0);
  expect(await onServer("drag-weekly")).not.toContain("RECURRENCE-ID");

  // This event: that date alone moves, the rest stay.
  await dropWeekly();
  await page.getByTestId("move-scope-confirm").click();
  await expect(page.getByText("Saved to Drag")).toBeVisible({
    timeout: 30_000,
  });
  await expect
    .poll(() => onServer("drag-weekly"))
    .toContain(`RECURRENCE-ID:${icsTime(day(10, 18))}`);
  const weeklyNow = await onServer("drag-weekly");
  expect(weeklyNow).toMatch(at("DTSTART", day(11, 18)));
  expect(weeklyNow).toMatch(at("DTSTART", day(3, 18)));

  // A discover calendar's event does not lift.
  await drag(page, "Draggig", day(16), false);
  await expect(page.getByTestId("drag-copy")).toHaveCount(0);
  await expect(page.locator('[data-testid^="drop-target-"]')).toHaveCount(0);
  await page.mouse.up();
  expect(await onServer("drag-gig", TRAY)).toMatch(at("DTSTART", day(14, 20)));
});
