import { expect, test, type Page } from '@playwright/test';

// Month-grid e2e: drives the real web app (Metro on the host) against the
// throwaway Radicale seeded by seed.mjs. Dates mirror seed.mjs: fixtures live
// in the current month and current month + 3. Navigation uses `?day=` deep
// links and the header label (tap → today) — deterministic, unlike scroll
// gestures.

const pad = (n: number) => `${n}`.padStart(2, '0');
const dateString = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthTitle = (d: Date) =>
  d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

const now = new Date();
const target = (day: number) =>
  new Date(now.getFullYear(), now.getMonth() + 3, day);
/** Local-midnight Monday of the week containing d (grid weeks start Monday). */
const weekStartOf = (d: Date) =>
  new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate() - ((d.getDay() + 6) % 7)
  );

/**
 * Grid queries must be scoped to one month's page. The grid pages by month and
 * every page draws six week rows starting at the week of the 1st, so the week
 * straddling two months is drawn by both — a boundary day cell, and any chip
 * or banner sitting in it, exists twice in the DOM.
 */
const gridPage = (page: Page, d: Date) =>
  page.getByTestId(`month-page-${d.getFullYear()}-${pad(d.getMonth() + 1)}`);

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `artifacts/${name}.png`, fullPage: true });
}

async function cancelEditor(page: Page) {
  await page.getByTestId('editor-cancel').click();
  await expect(page.getByTestId('event-editor')).toHaveCount(0);
}

/** The editor title is the start date in the PAGE's locale — compute it there. */
async function editorTitleFor(page: Page, day: string) {
  return page.evaluate(
    (d: string) =>
      new Date(`${d}T00:00:00`).toLocaleDateString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      }),
    day
  );
}

test('month grid: chips, banners, navigation, editors', async ({ page }) => {
  await test.step('initial load: current month, today chip visible', async () => {
    await page.goto('/');
    await expect(page.getByTestId('calendar-header-label')).toHaveText(
      monthTitle(now),
      { timeout: 30_000 }
    );
    await expect(gridPage(page, now).getByText('🧪 E2E Today')).toBeVisible({
      timeout: 30_000,
    });
    await shot(page, '01-initial-today');
  });

  await test.step('deep link → target month, first week snapped to top', async () => {
    await page.goto(`/?day=${dateString(target(1))}`);
    await expect(page.getByTestId('calendar-header-label')).toHaveText(
      monthTitle(target(1)),
      { timeout: 30_000 }
    );
    await expect(
      gridPage(page, target(1)).getByText('🧪 E2E Morning')
    ).toBeVisible({ timeout: 30_000 });

    // The week containing the 1st settles at the grid's top edge.
    const gridBox = await page.getByTestId('month-grid').boundingBox();
    const firstWeekCell = gridPage(page, target(1)).getByTestId(
      `day-cell-${dateString(weekStartOf(target(1)))}`
    );
    await expect
      .poll(async () => {
        const box = await firstWeekCell.boundingBox();
        return box ? Math.abs(box.y - gridBox!.y) : Number.NaN;
      })
      .toBeLessThan(4);
    await shot(page, '02-target-month');
  });

  await test.step('banners: span days 8–10, stack above chips, break per week', async () => {
    // Some segment of the multi-day banner horizontally overlaps each covered
    // day cell (the span may break across a week edge on some run dates).
    const segments = gridPage(page, target(1)).getByText('🧪 E2E Multi-day');
    const segmentBoxes = [];
    for (let i = 0; i < (await segments.count()); i++) {
      segmentBoxes.push(await segments.nth(i).boundingBox());
    }
    for (const day of [8, 9, 10]) {
      const cell = await gridPage(page, target(1))
        .getByTestId(`day-cell-${dateString(target(day))}`)
        .boundingBox();
      expect(
        segmentBoxes.some(
          (b) => b && cell && b.x < cell.x + cell.width && b.x + b.width > cell.x
        )
      ).toBe(true);
    }

    // All-day banner renders above the timed chip on day 6.
    const allDayBox = await gridPage(page, target(1))
      .getByText('🧪 E2E All-day')
      .boundingBox();
    const morningBox = await gridPage(page, target(1))
      .getByText('🧪 E2E Morning')
      .boundingBox();
    expect(allDayBox!.y).toBeLessThan(morningBox!.y);

    // A 9-day banner always crosses a week boundary → ≥2 segments.
    expect(
      await gridPage(page, target(1)).getByText('🧪 E2E Longspan').count()
    ).toBeGreaterThanOrEqual(2);
    await shot(page, '03-banners');
  });

  await test.step('long-press a day → popover → edit editor', async () => {
    // The overflow counter is a label, not a button — the cell underneath owns
    // both gestures: tap creates an event, long press opens the day.
    const day = gridPage(page, target(1));
    await expect(day.getByTestId(`more-${dateString(target(27))}`)).toHaveText(
      /\+\d+/
    );
    // Aim at the day-number corner: the cell is full of chips, and those do
    // capture their own pixels.
    await day
      .getByTestId(`day-cell-${dateString(target(27))}`)
      .click({ delay: 700, position: { x: 10, y: 6 } });
    const popover = page.getByTestId('day-popover');
    await expect(popover).toBeVisible();
    await expect(popover.getByText(/🧪 Busy/)).toHaveCount(10);
    await popover.getByText('🧪 Busy 5').click();
    await expect(page.getByTestId('event-editor')).toBeVisible();
    await expect(page.getByTestId('editor-summary')).toHaveValue('🧪 Busy 5');
    await expect(page.getByTestId('editor-title')).toHaveText(
      await editorTitleFor(page, dateString(target(27)))
    );
    await shot(page, '04-popover-edit');
    await cancelEditor(page);
  });

  await test.step('empty day tap → create editor dated that day', async () => {
    await gridPage(page, target(1))
      .getByTestId(`day-cell-${dateString(target(15))}`)
      .click();
    await expect(page.getByTestId('event-editor')).toBeVisible();
    // Native date input: value is locale-independent ISO.
    await expect(page.getByTestId('editor-start-date')).toHaveValue(
      dateString(target(15))
    );
    await expect(page.getByTestId('editor-title')).toHaveText(
      await editorTitleFor(page, dateString(target(15)))
    );
    await shot(page, '05-day-tap-create');
    await cancelEditor(page);
  });

  await test.step('chip tap → edit editor', async () => {
    await gridPage(page, target(1)).getByText('🧪 E2E Morning').click();
    await expect(page.getByTestId('event-editor')).toBeVisible();
    await expect(page.getByTestId('editor-summary')).toHaveValue(
      '🧪 E2E Morning'
    );
    await shot(page, '06-chip-tap-edit');
    await cancelEditor(page);
  });

  await test.step('recurring create → daily ×3 → chips on three days → delete series', async () => {
    await gridPage(page, target(1))
      .getByTestId(`day-cell-${dateString(target(15))}`)
      .click();
    await expect(page.getByTestId('event-editor')).toBeVisible();
    await page.getByTestId('editor-summary').fill('🧪 E2E Recurring');
    await page.getByTestId('editor-repeat-preset-daily').click();
    await page.getByTestId('editor-repeat-end-count').click();
    await page.getByTestId('editor-repeat-count').fill('3');
    await page.getByTestId('editor-save').click();
    await expect(page.getByTestId('event-editor')).toHaveCount(0);
    // One occurrence chip on each of the three days.
    await expect(
      gridPage(page, target(1)).getByText('🧪 E2E Recurring')
    ).toHaveCount(3, { timeout: 30_000 });
    await shot(page, '06b-recurring-chips');

    // Whole-series delete from any occurrence.
    await gridPage(page, target(1)).getByText('🧪 E2E Recurring').nth(1).click();
    await expect(page.getByTestId('editor-delete')).toHaveText('Delete series');
    await page.getByTestId('editor-delete').click();
    await expect(
      gridPage(page, target(1)).getByText('🧪 E2E Recurring')
    ).toHaveCount(0, { timeout: 30_000 });
  });

  await test.step('next month is empty', async () => {
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 4, 1);
    await page.goto(`/?day=${dateString(nextMonth)}`);
    await expect(page.getByTestId('calendar-header-label')).toHaveText(
      monthTitle(nextMonth),
      { timeout: 30_000 }
    );
    // Seeded "E2E" events end by target(25) and can't reach this month's first
    // grid week; the day-27 "Busy" fixtures are deliberately excluded from
    // this match since that week can start as early as the 26th. Rows mounted
    // outside the viewport may still hold prior-month chips in the DOM —
    // "empty" means no fixture intersects the grid viewport.
    const gridBox = await page.getByTestId('month-grid').boundingBox();
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
        { timeout: 30_000 }
      )
      .toBe(0);
    await shot(page, '07-empty-month');
  });

  await test.step('Today returns to the current month', async () => {
    await page.getByTestId('calendar-today').click();
    await expect(page.getByTestId('calendar-header-label')).toHaveText(
      monthTitle(now)
    );
    await expect(gridPage(page, now).getByText('🧪 E2E Today')).toBeVisible({
      timeout: 30_000,
    });
    await shot(page, '08-today');
  });

  await test.step('deep links: ?day= and ?new=', async () => {
    await page.goto(`/?day=${dateString(target(20))}`);
    await expect(page.getByTestId('calendar-header-label')).toHaveText(
      monthTitle(target(1)),
      { timeout: 30_000 }
    );
    await expect(page.getByText('🧪 E2E Scroll target')).toBeVisible({
      timeout: 30_000,
    });
    await shot(page, '09-deeplink-day');

    await page.goto('/?new=e2e-nonce');
    await expect(page.getByTestId('event-editor')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId('editor-start-date')).toHaveValue(
      dateString(now)
    );
    await shot(page, '10-deeplink-new');
    await cancelEditor(page);
  });

  await test.step('narrow default: editor is a bottom sheet hugging the bottom edge', async () => {
    await page.goto('/?new=e2e-sheet-nonce');
    const editor = page.getByTestId('event-editor');
    await expect(editor).toBeVisible({ timeout: 30_000 });
    const box = await editor.boundingBox();
    const viewport = page.viewportSize()!;
    expect(box!.y + box!.height).toBeGreaterThan(viewport.height - 80);
    await shot(page, '11-narrow-sheet');
    await cancelEditor(page);
  });

  await test.step('wide viewport: editor is the centered dialog', async () => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/?new=e2e-dialog-nonce');
    const editor = page.getByTestId('event-editor');
    await expect(editor).toBeVisible({ timeout: 30_000 });
    // Dialog, not sheet: capped at maxWidth 480 and vertically centered.
    const box = await editor.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(500);
    expect(box!.y).toBeGreaterThan(20);
    await expect(page.getByTestId('editor-title')).toHaveText(
      await editorTitleFor(page, dateString(now))
    );
    await shot(page, '12-wide-dialog');
    await cancelEditor(page);
  });
});
