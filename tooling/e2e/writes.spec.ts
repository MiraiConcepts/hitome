import { expect, test, type Page } from "@playwright/test";

// Write-path e2e: every way the app changes the server — create, edit and
// delete with each repeat scope, undo of each delete, moving between
// calendars, and a conflicting edit — checked twice: on the grid, and in the
// throwaway Radicale itself (a GET on the calendar collection returns all of
// its objects as one VCALENDAR). Lives in month + 6, which month-grid.spec
// never touches.

const pad = (n: number) => `${n}`.padStart(2, "0");
const dateString = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const now = new Date();
const day = (n: number) => new Date(now.getFullYear(), now.getMonth() + 6, n);

const CAL = "/dav/test/e2e/";
const OTHER = "/dav/test/e2e-other/";
const HOLD = { delay: 700 } as const;

const grid = (page: Page) => page.getByTestId("month-grid");
const chips = (page: Page, title: string) =>
  grid(page).getByText(title, { exact: true });

/** Every object in a calendar, as the server holds it. */
async function server(page: Page, path = CAL): Promise<string> {
  const res = await page.request.get(path);
  expect(res.ok()).toBe(true);
  return res.text();
}

/** How many VEVENTs on the server carry this exact title. */
async function countOnServer(page: Page, title: string, path = CAL) {
  const ics = await server(page, path);
  return ics.split(/\r?\n/).filter((l) => l === `SUMMARY:${title}`).length;
}

async function openMonth(page: Page) {
  await page.goto(`/?day=${dateString(day(1))}`);
  await expect(page.getByTestId("calendar-header-label")).toHaveText(
    day(1).toLocaleDateString("en-GB", { month: "short", year: "numeric" }),
    { timeout: 30_000 },
  );
}

/** Hold a day, type a title, pick the e2e calendar, optionally repeat. */
async function create(
  page: Page,
  onDay: number,
  title: string,
  repeat?: { daily: number },
) {
  // Retried: right after load the grid can still sit under its loading
  // cover, which swallows the hold.
  await expect(async () => {
    await grid(page)
      .getByTestId(`day-cell-${dateString(day(onDay))}`)
      .click(HOLD);
    await expect(page.getByTestId("event-editor")).toBeVisible({
      timeout: 2_000,
    });
  }).toPass({ timeout: 20_000 });
  await page.getByTestId("editor-summary").fill(title);
  await page.getByRole("button", { name: "test/e2e", exact: true }).click();
  if (repeat) {
    await page.getByTestId("editor-repeat-preset-daily").click();
    await page.getByTestId("editor-repeat-end-count").click();
    await page.getByTestId("editor-repeat-count").fill(String(repeat.daily));
  }
  await page.getByTestId("editor-save").click();
  await expect(page.getByTestId("event-editor")).toHaveCount(0);
}

/** Open the nth chip with this title, retitle it, save with a scope. */
async function retitle(
  page: Page,
  title: string,
  nth: number,
  next: string,
  scope?: "this" | "following" | "all",
) {
  await chips(page, title).nth(nth).click();
  await page.getByTestId("editor-summary").fill(next);
  await page.getByTestId("editor-save").click();
  if (scope) await page.getByTestId(`editor-scope-${scope}`).click();
  await expect(page.getByTestId("event-editor")).toHaveCount(0);
}

async function remove(
  page: Page,
  title: string,
  nth: number,
  scope?: "this" | "following" | "all",
) {
  await chips(page, title).nth(nth).click();
  await page.getByTestId("editor-delete").click();
  if (scope) await page.getByTestId(`editor-scope-${scope}`).click();
  await expect(page.getByTestId("event-editor")).toHaveCount(0);
}

const undo = (page: Page) =>
  page.getByRole("button", { name: "Undo" }).click();

test.beforeAll(async ({ request }) => {
  // A second calendar, so moving has somewhere to go.
  const res = await request.fetch(OTHER, {
    method: "MKCALENDAR",
    headers: { "Content-Type": "application/xml" },
    data: `<?xml version="1.0"?>
<C:mkcalendar xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:set><D:prop><D:displayname>e2e-other</D:displayname></D:prop></D:set>
</C:mkcalendar>`,
  });
  expect([201, 405, 409]).toContain(res.status());
});

test("writes reach the server: create, edit, delete, undo, move, conflict", async ({
  page,
}) => {
  await openMonth(page);

  await test.step("one-off: create → retitle → delete → undo → delete", async () => {
    await create(page, 3, "🧪 W One");
    await expect(chips(page, "🧪 W One")).toHaveCount(1, { timeout: 30_000 });
    expect(await countOnServer(page, "🧪 W One")).toBe(1);

    await retitle(page, "🧪 W One", 0, "🧪 W One edited");
    await expect(chips(page, "🧪 W One edited")).toHaveCount(1, {
      timeout: 30_000,
    });
    expect(await countOnServer(page, "🧪 W One")).toBe(0);
    expect(await countOnServer(page, "🧪 W One edited")).toBe(1);

    await remove(page, "🧪 W One edited", 0);
    await expect(chips(page, "🧪 W One edited")).toHaveCount(0, {
      timeout: 30_000,
    });
    expect(await countOnServer(page, "🧪 W One edited")).toBe(0);

    await undo(page);
    await expect(chips(page, "🧪 W One edited")).toHaveCount(1, {
      timeout: 30_000,
    });
    expect(await countOnServer(page, "🧪 W One edited")).toBe(1);

    await remove(page, "🧪 W One edited", 0);
    await expect(chips(page, "🧪 W One edited")).toHaveCount(0, {
      timeout: 30_000,
    });
    expect(await countOnServer(page, "🧪 W One edited")).toBe(0);
  });

  await test.step("series: edit this / following / all", async () => {
    // Daily ×4 on days 8–11.
    await create(page, 8, "🧪 W Series", { daily: 4 });
    await expect(chips(page, "🧪 W Series")).toHaveCount(4, {
      timeout: 30_000,
    });

    // This: day 9 alone, as an override on the same object.
    await retitle(page, "🧪 W Series", 1, "🧪 W This", "this");
    await expect(chips(page, "🧪 W This")).toHaveCount(1, { timeout: 30_000 });
    await expect(chips(page, "🧪 W Series")).toHaveCount(3);
    expect(await server(page)).toMatch(/RECURRENCE-ID/);

    // This and following: days 10–11 split off into a new object.
    await retitle(page, "🧪 W Series", 1, "🧪 W Following", "following");
    await expect(chips(page, "🧪 W Following")).toHaveCount(2, {
      timeout: 30_000,
    });
    await expect(chips(page, "🧪 W Series")).toHaveCount(1);
    await expect(chips(page, "🧪 W This")).toHaveCount(1);

    // All, from the head: the master retitles, day 9's override keeps its own.
    await retitle(page, "🧪 W Series", 0, "🧪 W All", "all");
    await expect(chips(page, "🧪 W All")).toHaveCount(1, { timeout: 30_000 });
    await expect(chips(page, "🧪 W This")).toHaveCount(1);
    await expect(chips(page, "🧪 W Following")).toHaveCount(2);
  });

  await test.step("series: delete this / following, each undone", async () => {
    // Following, from the tail's second day: day 11 goes; undo brings it back.
    await remove(page, "🧪 W Following", 1, "following");
    await expect(chips(page, "🧪 W Following")).toHaveCount(1, {
      timeout: 30_000,
    });
    await undo(page);
    await expect(chips(page, "🧪 W Following")).toHaveCount(2, {
      timeout: 30_000,
    });

    // This, on day 10: an exclusion; undo brings it back.
    await remove(page, "🧪 W Following", 0, "this");
    await expect(chips(page, "🧪 W Following")).toHaveCount(1, {
      timeout: 30_000,
    });
    expect(await server(page)).toMatch(/EXDATE/);
    await undo(page);
    await expect(chips(page, "🧪 W Following")).toHaveCount(2, {
      timeout: 30_000,
    });

    // And everything gone, both objects, by "all" from each.
    await remove(page, "🧪 W Following", 0, "all");
    await remove(page, "🧪 W All", 0, "all");
    for (const title of ["🧪 W All", "🧪 W This", "🧪 W Following"])
      await expect(chips(page, title)).toHaveCount(0, { timeout: 30_000 });
    for (const title of ["🧪 W Series", "🧪 W All", "🧪 W This", "🧪 W Following"])
      expect(await countOnServer(page, title)).toBe(0);
  });

  await test.step("move to another calendar", async () => {
    await create(page, 15, "🧪 W Move");
    await expect(chips(page, "🧪 W Move")).toHaveCount(1, { timeout: 30_000 });
    await chips(page, "🧪 W Move").click();
    await page.getByRole("button", { name: "e2e-other", exact: true }).click();
    await page.getByTestId("editor-save").click();
    await expect(page.getByTestId("event-editor")).toHaveCount(0);
    await expect(chips(page, "🧪 W Move")).toHaveCount(1, { timeout: 30_000 });
    await expect
      .poll(() => countOnServer(page, "🧪 W Move", OTHER), { timeout: 30_000 })
      .toBe(1);
    expect(await countOnServer(page, "🧪 W Move")).toBe(0);
  });

  await test.step("a conflicting edit is refused, not written over", async () => {
    await create(page, 17, "🧪 W Conflict");
    await expect(chips(page, "🧪 W Conflict")).toHaveCount(1, {
      timeout: 30_000,
    });
    await chips(page, "🧪 W Conflict").click();

    // Someone else changes it while the editor is open.
    const ics = await server(page);
    const uid = ics
      .split(/BEGIN:VEVENT/)
      .find((v) => v.includes("SUMMARY:🧪 W Conflict"))!
      .match(/UID:(.+)/)![1]
      .trim();
    const put = await page.request.put(`${CAL}${uid}.ics`, {
      headers: { "Content-Type": "text/calendar; charset=utf-8" },
      data: [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//hitome e2e//EN",
        "BEGIN:VEVENT",
        `UID:${uid}`,
        "DTSTAMP:20260101T000000Z",
        `DTSTART;VALUE=DATE:${dateString(day(17)).replace(/-/g, "")}`,
        "SUMMARY:🧪 W Changed elsewhere",
        "END:VEVENT",
        "END:VCALENDAR",
        "",
      ].join("\r\n"),
    });
    expect(put.ok()).toBe(true);

    await page.getByTestId("editor-summary").fill("🧪 W Mine");
    await page.getByTestId("editor-save").click();
    await expect(page.getByText(/^Event changed elsewhere/)).toBeVisible({
      timeout: 30_000,
    });
    expect(await countOnServer(page, "🧪 W Mine")).toBe(0);
    expect(await countOnServer(page, "🧪 W Changed elsewhere")).toBe(1);
  });

  await test.step("offline: a failed save keeps the draft and says why", async () => {
    await grid(page)
      .getByTestId(`day-cell-${dateString(day(20))}`)
      .click(HOLD);
    await page.getByTestId("editor-summary").fill("🧪 W Offline");
    // The server vanishes for writes.
    await page.route("**/dav/**", (route) =>
      route.request().method() === "PUT" ? route.abort("internetdisconnected") : route.continue(),
    );
    await page.getByTestId("editor-save").click();
    await expect(page.getByText(/^Not saved — can’t reach/)).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("event-editor")).toBeVisible();
    await expect(page.getByTestId("editor-summary")).toHaveValue("🧪 W Offline");

    // Back online: the same editor saves.
    await page.unrouteAll();
    await page.getByTestId("editor-save").click();
    await expect(page.getByTestId("event-editor")).toHaveCount(0);
    await expect
      .poll(() => countOnServer(page, "🧪 W Offline"), { timeout: 30_000 })
      .toBe(1);
  });
});
