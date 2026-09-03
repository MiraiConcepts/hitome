import { expect, test, type Page } from "@playwright/test";

// Month-grid e2e: drives the real web app (Metro on the host) against the
// throwaway Radicale seeded by seed.mjs. Dates mirror seed.mjs: fixtures live
// in the current month and current month + 3. Navigation uses `?day=` deep
// links and the header label (tap → today) — deterministic, unlike scroll
// gestures.

const pad = (n: number) => `${n}`.padStart(2, "0");
const dateString = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthTitle = (d: Date) =>
  d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });

const now = new Date();
const target = (day: number) =>
  new Date(now.getFullYear(), now.getMonth() + 3, day);
/** Local-midnight Monday of the week containing d (grid weeks start Monday). */
const weekStartOf = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));

/**
 * Scope grid queries to the grid, nothing finer. The grid is one continuous
 * ribbon of week rows, so every day cell is unique in the DOM. It was not
 * always: the grid used to page by month, and because a month's six rows
 * overrun the next month's by one or two, each page redrew a week its
 * neighbour also drew — a boundary day cell, and any chip in it, existed
 * twice, and every query here had to name a page to disambiguate.
 */
const grid = (page: Page) => page.getByTestId("month-grid");

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `artifacts/${name}.png`, fullPage: true });
}

async function cancelEditor(page: Page) {
  await page.getByTestId("editor-cancel").click();
  await expect(page.getByTestId("event-editor")).toHaveCount(0);
}

/** A hold — the create gesture. Comfortably past the app's 500ms threshold. */
const HOLD = { delay: 700 } as const;

/** The header's second line is today's date in the PAGE's locale. */
async function todayLabelFor(page: Page, day: string) {
  return page.evaluate(
    (d: string) =>
      new Date(`${d}T00:00:00`).toLocaleDateString(undefined, {
        weekday: "short",
        day: "numeric",
        month: "long",
      }),
    day,
  );
}

/** The editor title is the start date in the PAGE's locale — compute it there. */
async function editorTitleFor(page: Page, day: string) {
  return page.evaluate(
    (d: string) =>
      new Date(`${d}T00:00:00`).toLocaleDateString(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short",
      }),
    day,
  );
}

test("month grid: chips, banners, navigation, editors", async ({ page }) => {
  await test.step("initial load: current month, today chip visible", async () => {
    await page.goto("/");
    await expect(page.getByTestId("calendar-header-label")).toHaveText(
      monthTitle(now),
      { timeout: 30_000 },
    );
    await expect(grid(page).getByText("🧪 E2E Today")).toBeVisible({
      timeout: 30_000,
    });
    // The header's second line reads today's date while the server is
    // answering; it only turns into an offline warning when one doesn't.
    await expect(page.getByTestId("calendar-updated")).toHaveText(
      await todayLabelFor(page, dateString(now)),
    );
    await shot(page, "01-initial-today");
  });

  await test.step("deep link → target month, first week snapped to top", async () => {
    await page.goto(`/?day=${dateString(target(1))}`);
    await expect(page.getByTestId("calendar-header-label")).toHaveText(
      monthTitle(target(1)),
      { timeout: 30_000 },
    );
    await expect(grid(page).getByText("🧪 E2E Morning")).toBeVisible({
      timeout: 30_000,
    });

    // The week containing the 1st settles at the grid's top edge.
    const gridBox = await page.getByTestId("month-grid").boundingBox();
    const firstWeekCell = grid(page).getByTestId(
      `day-cell-${dateString(weekStartOf(target(1)))}`,
    );
    await expect
      .poll(async () => {
        const box = await firstWeekCell.boundingBox();
        return box ? Math.abs(box.y - gridBox!.y) : Number.NaN;
      })
      .toBeLessThan(4);
    await shot(page, "02-target-month");
  });

  await test.step("ribbon: the boundary week exists once, not once per month", async () => {
    // The regression this grid was rebuilt for. Month pages each drew the week
    // straddling their boundary, so holding a swipe mid-seam showed that week
    // twice, stacked — August's copy dimmed above September's bright one. A
    // ribbon cannot: the week is one row. Every day of the straddling week is
    // asserted, including the ones belonging to the previous month, which are
    // exactly the cells that used to double.
    const weekStart = weekStartOf(target(1));
    for (let i = 0; i < 7; i++) {
      const d = new Date(
        weekStart.getFullYear(),
        weekStart.getMonth(),
        weekStart.getDate() + i,
      );
      await expect(page.getByTestId(`day-cell-${dateString(d)}`)).toHaveCount(
        1,
      );
    }
  });

  await test.step("web: the browser snaps to months, not to weeks", async () => {
    // Web has no snapToOffsets under RNW, so the detents are declared to the
    // browser as CSS snap positions: mandatory on the scroller, aligned on the
    // month-start rows ALONE. Aligning every row (what RNW's own
    // `pagingEnabled` would do) would page by week instead — hence the
    // sparseness assertion, which is the whole mechanism in one line. Doing it
    // this way is also what fixed keyboard and scrollbar scrolling, which the
    // old JS settle never saw and left parked between months.
    // Declaring it this way is also what fixed keyboard and scrollbar
    // scrolling, which the old JS settle never saw.
    // Snapping is deliberately suspended across a programmatic jump (see
    // jumpTo in month-grid) — the deep link that got us here is one — so poll
    // for it to be handed back rather than sampling inside that window.
    await expect
      .poll(async () =>
        grid(page).evaluate(
          (el: HTMLElement) => getComputedStyle(el).scrollSnapType,
        ),
      )
      .toBe("y mandatory");
    const aligned = await grid(page).evaluate(
      (el: HTMLElement) =>
        Array.from(el.querySelectorAll("*")).filter(
          (n) => getComputedStyle(n as HTMLElement).scrollSnapAlign === "start",
        ).length,
    );
    const rows = (await page.locator('[data-testid^="day-cell-"]').count()) / 7;
    expect(aligned).toBeGreaterThan(0);
    expect(aligned).toBeLessThan(rows);
  });

  await test.step("banners: span days 8–10, stack above chips, break per week", async () => {
    // Some segment of the multi-day banner horizontally overlaps each covered
    // day cell (the span may break across a week edge on some run dates).
    const segments = grid(page).getByText("🧪 E2E Multi-day");
    const segmentBoxes = [];
    for (let i = 0; i < (await segments.count()); i++) {
      segmentBoxes.push(await segments.nth(i).boundingBox());
    }
    for (const day of [8, 9, 10]) {
      const cell = await grid(page)
        .getByTestId(`day-cell-${dateString(target(day))}`)
        .boundingBox();
      expect(
        segmentBoxes.some(
          (b) =>
            b && cell && b.x < cell.x + cell.width && b.x + b.width > cell.x,
        ),
      ).toBe(true);
    }

    // All-day banner renders above the timed chip on day 6.
    const allDayBox = await grid(page)
      .getByText("🧪 E2E All-day")
      .boundingBox();
    const morningBox = await grid(page)
      .getByText("🧪 E2E Morning")
      .boundingBox();
    expect(allDayBox!.y).toBeLessThan(morningBox!.y);

    // A 9-day banner always crosses a week boundary → ≥2 segments.
    expect(
      await grid(page).getByText("🧪 E2E Longspan").count(),
    ).toBeGreaterThanOrEqual(2);
    await shot(page, "03-banners");
  });

  await test.step("tap an overflowing day → popover → edit editor", async () => {
    // Day 27 shows a "+N" counter, so it holds more than it can draw. Every
    // tap in it answers with the whole day's list — the empty corner and a
    // chip alike, since the chips are an arbitrary few of the ten.
    const day = grid(page);
    await expect(day.getByTestId(`more-${dateString(target(27))}`)).toHaveText(
      /\+\d+/,
    );
    const popover = page.getByTestId("day-popover");

    // The day-number corner, which no chip covers. Tapping a row closes the
    // popover on its way to the editor, which is how each pass here ends.
    await day
      .getByTestId(`day-cell-${dateString(target(27))}`)
      .click({ position: { x: 10, y: 6 } });
    await expect(popover).toBeVisible();
    await expect(popover.getByText(/🧪 Busy/)).toHaveCount(10);
    await popover.getByText("🧪 Busy 5").click();
    await expect(page.getByTestId("event-editor")).toBeVisible();
    await expect(page.getByTestId("editor-summary")).toHaveValue("🧪 Busy 5");
    await expect(page.getByTestId("editor-title")).toHaveText(
      await editorTitleFor(page, dateString(target(27))),
    );
    await shot(page, "04-popover-edit");
    await cancelEditor(page);

    // Straight onto one of the drawn chips: still the day's list, not that one
    // event — the chips are an arbitrary few of the ten.
    await day
      .getByText(/🧪 Busy/)
      .first()
      .click();
    await expect(popover).toBeVisible();
    await expect(popover.getByText(/🧪 Busy/)).toHaveCount(10);
    await popover.getByText("🧪 Busy 5").click();
    await expect(page.getByTestId("editor-summary")).toHaveValue("🧪 Busy 5");
    await cancelEditor(page);
  });

  await test.step("hold an empty day → create editor dated that day", async () => {
    const cell = grid(page).getByTestId(`day-cell-${dateString(target(15))}`);
    // A tap on a day with nothing to list is inert — creating is the hold.
    await cell.click();
    await expect(page.getByTestId("event-editor")).toHaveCount(0);

    await cell.click(HOLD);
    await expect(page.getByTestId("event-editor")).toBeVisible();
    // Native date input: value is locale-independent ISO.
    await expect(page.getByTestId("editor-start-date")).toHaveValue(
      dateString(target(15)),
    );
    await expect(page.getByTestId("editor-title")).toHaveText(
      await editorTitleFor(page, dateString(target(15))),
    );
    await shot(page, "05-day-hold-create");
    await cancelEditor(page);
  });

  await test.step("chip tap → edit editor", async () => {
    await grid(page).getByText("🧪 E2E Morning").click();
    await expect(page.getByTestId("event-editor")).toBeVisible();
    await expect(page.getByTestId("editor-summary")).toHaveValue(
      "🧪 E2E Morning",
    );
    await shot(page, "06-chip-tap-edit");
    await cancelEditor(page);
  });

  await test.step("hold a chip → create editor on the day under it", async () => {
    // The cell's gestures reach through its events: holding a chip creates on
    // its day rather than opening the event the tap would have.
    await grid(page).getByText("🧪 E2E Morning").click(HOLD);
    await expect(page.getByTestId("event-editor")).toBeVisible();
    await expect(page.getByTestId("editor-summary")).toHaveValue("");
    await expect(page.getByTestId("editor-start-date")).toHaveValue(
      dateString(target(6)),
    );
    await shot(page, "06a-chip-hold-create");
    await cancelEditor(page);
  });

  await test.step("recurring create → daily ×3 → chips on three days → delete series", async () => {
    await grid(page)
      .getByTestId(`day-cell-${dateString(target(15))}`)
      .click(HOLD);
    await expect(page.getByTestId("event-editor")).toBeVisible();
    await page.getByTestId("editor-summary").fill("🧪 E2E Recurring");
    await page.getByTestId("editor-repeat-preset-daily").click();
    await page.getByTestId("editor-repeat-end-count").click();
    await page.getByTestId("editor-repeat-count").fill("3");
    await page.getByTestId("editor-save").click();
    await expect(page.getByTestId("event-editor")).toHaveCount(0);
    // One occurrence chip on each of the three days.
    await expect(grid(page).getByText("🧪 E2E Recurring")).toHaveCount(3, {
      timeout: 30_000,
    });
    await shot(page, "06b-recurring-chips");

    // Whole-series delete from any occurrence.
    await grid(page).getByText("🧪 E2E Recurring").nth(1).click();
    await expect(page.getByTestId("editor-delete")).toHaveText("Delete series");
    await page.getByTestId("editor-delete").click();
    await expect(grid(page).getByText("🧪 E2E Recurring")).toHaveCount(0, {
      timeout: 30_000,
    });
  });

  await test.step("next month is empty", async () => {
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 4, 1);
    await page.goto(`/?day=${dateString(nextMonth)}`);
    await expect(page.getByTestId("calendar-header-label")).toHaveText(
      monthTitle(nextMonth),
      { timeout: 30_000 },
    );
    // Seeded "E2E" events end by target(25) and can't reach this month's first
    // grid week; the day-27 "Busy" fixtures are deliberately excluded from
    // this match since that week can start as early as the 26th. Rows mounted
    // outside the viewport may still hold prior-month chips in the DOM —
    // "empty" means no fixture intersects the grid viewport.
    const gridBox = await page.getByTestId("month-grid").boundingBox();
    const fixtures = page.getByText(/🧪 E2E/);
    await expect
      .poll(
        async () => {
          const count = await fixtures.count();
          let inView = 0;
          for (let i = 0; i < count; i++) {
            const box = await fixtures.nth(i).boundingBox();
            if (
              box &&
              gridBox &&
              box.y < gridBox.y + gridBox.height &&
              box.y + box.height > gridBox.y
            ) {
              inView++;
            }
          }
          return inView;
        },
        { timeout: 30_000 },
      )
      .toBe(0);
    await shot(page, "07-empty-month");
  });

  await test.step("Today returns to the current month", async () => {
    await page.getByTestId("calendar-today").click();
    await expect(page.getByTestId("calendar-header-label")).toHaveText(
      monthTitle(now),
    );
    await expect(grid(page).getByText("🧪 E2E Today")).toBeVisible({
      timeout: 30_000,
    });
    await shot(page, "08-today");
  });

  await test.step("deep links: ?day= and ?new=", async () => {
    await page.goto(`/?day=${dateString(target(20))}`);
    await expect(page.getByTestId("calendar-header-label")).toHaveText(
      monthTitle(target(1)),
      { timeout: 30_000 },
    );
    await expect(page.getByText("🧪 E2E Scroll target")).toBeVisible({
      timeout: 30_000,
    });
    await shot(page, "09-deeplink-day");

    await page.goto("/?new=e2e-nonce");
    await expect(page.getByTestId("event-editor")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("editor-start-date")).toHaveValue(
      dateString(now),
    );
    await shot(page, "10-deeplink-new");
    await cancelEditor(page);
  });

  await test.step("narrow default: editor is a bottom sheet hugging the bottom edge", async () => {
    await page.goto("/?new=e2e-sheet-nonce");
    const editor = page.getByTestId("event-editor");
    await expect(editor).toBeVisible({ timeout: 30_000 });
    // Poll rather than sample once: the sheet sizes itself dynamically, and
    // caught mid-measure it sits at its max-height cap with the form only
    // part-filling it — a bottom edge that is real for a frame and then gone.
    const viewport = page.viewportSize()!;
    await expect
      .poll(async () => {
        const box = await editor.boundingBox();
        return box ? box.y + box.height : 0;
      })
      .toBeGreaterThan(viewport.height - 80);
    await shot(page, "11-narrow-sheet");
    await cancelEditor(page);
  });

  await test.step("wide viewport: editor is the centered dialog", async () => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/?new=e2e-dialog-nonce");
    const editor = page.getByTestId("event-editor");
    await expect(editor).toBeVisible({ timeout: 30_000 });
    // Dialog, not sheet: capped at maxWidth 480 and vertically centered.
    const box = await editor.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(500);
    expect(box!.y).toBeGreaterThan(20);
    await expect(page.getByTestId("editor-title")).toHaveText(
      await editorTitleFor(page, dateString(now)),
    );
    await shot(page, "12-wide-dialog");
    await cancelEditor(page);
  });
});
