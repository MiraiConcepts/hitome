# Week Ribbon Restore — Implementation Plan

Created: 2026-08-30 · Status: DONE — all phases landed and verified on web and
on a physical Android device. See the build log at the end.

## Context

Holding a mid-swipe drag on the month grid shows the seam week **drawn twice**:
once dimmed as August's trailing row, once bright as September's leading row
(reported with a screenshot at Aug↔Sep 2026). Both copies are correct — they
are two different pages each rendering the week they legitimately own.

The overlap is structural, not an edge case. A month page always renders six
week rows starting at the week containing the 1st, and the next month's page
starts either **4 or 5 rows** into the current one — never 6. Measured across
240 months (2020–2040):

| overlap | occurrences |
|---|---|
| 1 row | 83 |
| 2 rows | 157 |

So every seam doubles at least one week, and two-thirds of them double two.
Feb→Mar 2026 is a 2-row case where scrolling *down* moves content *backwards*
two weeks at the seam.

**No snapping change can fix this.** Snapping acts on release; a held drag
renders whatever sits at the raw scroll offset. The duplication has to leave
the content itself.

### This is a regression, not a new design

`scrollable-month-grid-plan.md` (2026-07-12) already specified a week ribbon
with month-start snap offsets, and it shipped that way:

- `9a5c1b2` — week ribbon + `monthStartWeekIndices` + `snapToOffsets`, as
  designed.
- `ee2567f` — dropped the custom wheel/pan pager; `monthStartWeekIndices` went
  with it, leaving `snapToInterval={rowHeight}`. The ribbon survived but
  snapped per **week**, so "one swipe = one month" was lost.
- `7a80f15` — the month-grid redesign restored one-swipe-one-month by rebuilding
  the grid as **paged months**. That fixed the feel and introduced this bug.

The month-start snap offsets deleted in `ee2567f` are what makes one swipe
equal one month *without* pages. This plan restores that, keeping every visual
decision from the `7a80f15` redesign.

### User decisions (locked, from question rounds)

- **Scroll model**: strict month snapping. Free movement only while the finger
  is down; every release lands on a month's first week. Detents (resting
  between months) were considered and rejected — the user confirmed they only
  ever hold, never park.
- **Dimming**: hold the outgoing month's dim/bright treatment through the
  entire drag, then flip once on settle. No live flip mid-drag.
- **Web**: native CSS scroll-snap rather than hand-written settling. The
  divergent flip threshold (browser's, not the tuned 15%) is accepted.
- Grid visuals, Monday weeks, rules/dividers, header, and long-press behaviour
  from `7a80f15` are untouched.

## Research summary (validated against installed sources)

- **Android (RN 0.85, `ReactScrollView.java`)**: `snapToOffsets` is real and
  works under virtualization — `flingAndSnap` iterates the *offsets array*
  (plain ints), unlike the `snapToAlignment`-without-interval path which walks
  rendered children and carries an explicit comment that snapping is impossible
  beyond them. **But**: `ScrollView.js:1809-1821` forces `pagingEnabled: true`
  on Android whenever `snapToOffsets` is set, and `disableIntervalMomentum`
  sets `targetOffset = getScrollY()` — snap-to-nearest-from-current, i.e. a 50%
  threshold. That discards the tuned `FLIP_FRACTION = 0.15`.
  → **Keep the existing JS settle on Android.** Only the offset arithmetic
  changes. Do not adopt `snapToOffsets`.
- **Web (react-native-web 0.21.x)**: no `snapToOffsets`, no `snapToInterval` —
  they are not in the prop whitelist and are silently dropped. The only snap
  RNW has is `pagingEnabled`, compiled to `scrollSnapType: 'y mandatory'` on
  the scroller plus `scrollSnapAlign: 'start'` on **every direct child**
  (`ScrollView/index.js:641-649`). With week rows as children that would snap
  every week.
  → RNW passes unknown camelCase styles straight through to CSS, so set
  `scrollSnapType` on the list style and `scrollSnapAlign` on **month-start
  rows only**. CSS creates snap positions only at elements declaring
  `scroll-snap-align`, so sparse targets give month quantization for free.
  This also explains the stale comment at `month-grid.tsx:153-161` ("RNW cannot
  page a virtualized list on its own") — true of `pagingEnabled`, sidestepped
  by sparse alignment, which only becomes available once rows are the list unit.
- **`onScrollEndDrag` / `onMomentumScrollEnd` never fire on RNW** (confirmed in
  the 2026-07-12 plan's own research). Settle detection on web must be an
  `onScroll` idle timer.
- **Prior art**: GNOME Calendar hit exactly this and solved it exactly this way
  — its month view was paged before GNOME 45, and the rewrite ("Extending the
  month to infinity") made it a continuous strip of week rows with row
  recycling. Counter-datapoint: Google Calendar's web app shipped free-scrolling
  months and reverted to paged — the lesson being that a ribbon *without* month
  quantization loses the sense of place, which is why strict snapping stays.
- **Data layer is already ribbon-ready.** `use-month-events.ts` is an
  accumulating cross-month store with ±1/±2 prefetch waves and snapshot
  seeding. It never assumed pages. GNOME's write-up flags "prefetch beyond the
  visible range, cache it, don't thrash the server" as the main ribbon pitfall
  — already built.

## Approach

One `FlatList` of ~522 fixed-height week rows (±5 years, Monday-start) instead
of 121 six-row month pages. Nothing can draw a week twice because each week
exists once. Month quantization moves from *page boundaries* to *snap offsets*
at month-start rows: Android via the existing JS settle, web via sparse CSS
snap alignment.

The settled view is pixel-identical to today — landing on September means
scrolling to `weekStart(Sep 1)`, showing Aug 31 → Oct 5.

### Design priorities (in order)

1. Minimal code / simplicity — net deletion 2. Preserve the `7a80f15` feel and
visuals 3. Explicit, traceable 4. Reusability 5. Readability

### `app/src/utils/calendar-grid.ts`

Restore the ribbon helpers from `7a80f15^`, **adapted to Monday weeks** (the
old versions predate the Monday switch — `weekStartOf` in the current file is
already correct and stays as-is):

- `buildWeekRange(today)` → `{ rangeStart: Date; weeks: string[] }` — Monday
  dateStrings, ±`RANGE_YEARS`, the FlatList data.
- `weekIndexOfDay(day, rangeStart)` — row index of a day's week.
- `monthStartWeekIndex(year, month0, rangeStart)` — the `scrollToMonth` target.
- `monthStartWeekIndices(rangeStart, months)` → `number[]` — the snap rows, one
  per entry of `buildMonthRange`, **index-parallel to it**. This 1:1 invariant
  is what lets a snap index name a month with no lookup: `months[i]` settles at
  row `monthStartWeekIndices[i]`.
- `isMonthStartWeek(weekStart)` — true when any day in `[week, week+7)` is a
  1st. Drives the web `scrollSnapAlign`.

Changed:

- `landingIndex(from, offset, height, velocity)` →
  `landingIndex(from, offset, snapOffsets, velocity)`. Gaps are now 4 **or** 5
  rows, so the 15% is measured against the distance to the neighbour in the
  direction of travel rather than a fixed page height:
  ```
  moved     = offset - snapOffsets[from]
  direction = sign(moved)                       // 0 → stay
  span      = |snapOffsets[from + direction] - snapOffsets[from]|
  flips     = |moved| >= span * FLIP_FRACTION || |velocity| >= FLIP_VELOCITY
  ```
  `FLIP_FRACTION`/`FLIP_VELOCITY` keep their current values and meaning.

Deleted:

- `weeksOfMonth` — the source of the duplication. No other callers.

Kept unchanged: `buildMonthRange`, `monthIndexIn`, `monthKey`, `gridFetchRange`,
`layoutWeek`, `isBanner`, `addDays`, `weekStartOf`, and every layout type.

### `app/src/components/calendar/month-grid.tsx`

- **`MonthPage` deleted.** `renderItem` renders a `WeekRow` directly.
- `data` = weeks · `getItemLayout` = `rowHeight * index` (simpler than today's
  page math) · `initialScrollIndex` = `monthStartWeekIndex(initialMonth)` ·
  `windowSize={7}` · `initialNumToRender={8}`.
- `rowHeight = height / 6` unchanged, so row geometry and `slotCount` are
  untouched.
- `currentIndex` / `dragFrom` become indices into `months` /
  `monthStartWeekIndices` rather than page indices. `settleTo` scrolls to
  `snapOffsets[target] * rowHeight`.
- **Settle detection**: one 150ms `onScroll` idle timer, shared by both
  platforms, firing `onSettled(month)`. This is what drives dimming and the
  fetch. Replaces the web `scrollend`/`wheel`/`touchstart` block entirely.
- **Android**: keeps `decelerationRate={0}`, `onScrollBeginDrag`,
  `onScrollEndDrag` → `settleTo` with the new `landingIndex`. Unchanged feel.
- **Web**: the whole `useEffect` listener block at `month-grid.tsx:238-277`
  and `scrollerNode` are deleted. Instead
  `style={[styles.list, Platform.OS === 'web' && styles.webSnap]}` with
  `webSnap: { scrollSnapType: 'y mandatory' }`, and `WeekRow` takes an
  `isMonthStart` prop applying `scrollSnapAlign: 'start'` on web. The browser
  then quantizes wheel, touch, keyboard and scrollbar scrolling alike — which
  also closes the bug where arrow keys / Page Down currently leave the grid
  parked forever, since `beginGesture` only ever armed on `wheel`/`touchstart`.
- **Stale comments removed**: the `pagingEnabled`/`setSnapping` paragraph at
  `:153-161` and the duplicated `decelerationRate` comment at `:393-397`, both
  of which describe machinery that does not exist.

### Dimming — the one behavioural change

`focusedYear`/`focusedMonth0` stop being per-page props and become a single
`settledMonth` state in `month-screen.tsx`, passed to every mounted `WeekRow`.
It updates only from the settle timer, so the outgoing month's shading holds
for the whole drag and flips once at the end, per the locked decision.

`WeekRow` is already `memo`'d; a settle re-renders the ~7 mounted rows.

**Accepted divergence**: the header label keeps tracking live from `onScroll`
(today's behaviour), so mid-drag the title can read "September" while the grid
is still shaded for August. With strict snapping the drag is short and
self-correcting. Flagged rather than silently changed — if it reads badly in
the tuning loop, moving the header onto the same settle signal is a one-line
follow-up.

### Fetch — one improvement, no restructuring

`useMonthEvents` is untouched. But `month-screen.tsx` currently drives it from
the **live** `onScroll` month, so a fling across several months issues a fetch
per crossing. Point it at the settled month instead: one fetch per landing,
and the ±1/±2 prefetch waves already cover the neighbours. Strictly fewer
requests, no new caching.

## Implementation phases

**P1 — Pure utils.** Restore/adapt the ribbon helpers, add `isMonthStartWeek`,
change `landingIndex`, delete `weeksOfMonth`. Tests in
`calendar-grid.test.ts`: Monday `weekStartOf` across all weekdays; week indices
across DST and year boundaries; `monthStartWeekIndices` index-parallel to
`buildMonthRange`; **gap is always 4 or 5 rows, never 6, over ±5y** (the
invariant this whole plan rests on); `landingIndex` flip/no-flip either side of
15% for both a 4-row and a 5-row gap, plus the velocity path and the
`direction === 0` case. ✓ `cd app && bun test src/utils/calendar-grid.test.ts`,
`bun run typecheck`, `bun run lint`.

**P2 — Grid rewrite.** Delete `MonthPage`, switch `data` to weeks, rewire
indices, add the shared settle timer, delete the web listener block, add the
CSS snap styles, remove the stale comments. ✓ typecheck/lint.

**P3 — Dimming + fetch wiring.** `settledMonth` state in `month-screen.tsx`,
threaded to `WeekRow`; fetch moved onto the settled month. ✓ typecheck/lint.

**P4 — Android verification** (`bun run android:dev`, **no `--bun`**). The
acceptance test is the original bug: drag to mid-seam, **hold**, confirm the
week appears once. Then: one swipe = one month at the old threshold; cold start
lands on today; `?day=` / `?new=` widget deep links; Today from afar; rotation
re-anchors.

**P5 — Web verification.** Dev proxy up in `tooling/dev-proxy/`, `bun run
web:proxy`, browse `:8882`. Hold mid-seam → single week. Wheel and touch land
on months. **Arrow keys / Page Down / space now settle instead of parking**
(the bug that CSS snap fixes). Narrow and wide panes.

**P6 — e2e.** Extend `tooling/e2e/month-grid.spec.ts`. The decisive regression
test is cheap and total: on a ribbon every day cell is unique across the whole
list, so assert `page.getByTestId('day-cell-2026-09-01')` has **count 1** at a
mid-seam scroll offset — that assertion fails on today's build and cannot pass
unless the duplication is gone. Plus: month-start week pinned to grid top after
a settle (boundingBox ±3px), and a keyboard-scroll settle assertion for the web
snap path. ✓ `tooling/e2e/run.sh` green.

## Files

**Modify**: `app/src/utils/calendar-grid.ts` (+ `calendar-grid.test.ts`),
`app/src/components/calendar/month-grid.tsx` (substantial),
`app/src/components/calendar/week-row.tsx` (`isMonthStart` prop + web snap
style), `app/src/components/calendar/month-screen.tsx` (settled-month state,
fetch source), `tooling/e2e/month-grid.spec.ts`

**Delete**: `weeksOfMonth`, `MonthPage`, `scrollerNode`, the web scroll-listener
`useEffect`, two stale comment blocks

**Untouched**: `use-month-events.ts`, `month-events-store.ts`, `layoutWeek` and
all layout types, `event-chip.tsx`, `day-popover.tsx`, `event-editor*`,
`widget/*`, `caldav/*`, header visuals, server/tooling infra

## Edge cases & risks

| Risk | Mitigation |
|---|---|
| **CSS `mandatory` + virtualization**: snap targets sit 4–5 rows apart; if the target row is unmounted mid-fling the browser has nothing to snap to | `windowSize={7}` + `initialNumToRender={8}` (the values the original ribbon shipped with) keeps ≥1 month-start row mounted at all times; verify with a hard fling in P5. Fallback: `y proximity`, which degrades to "never a half row" rather than parking |
| **CSS snap fights programmatic scrolls** (Today, chevrons, deep links) — documented in the 2026-07-12 build log | All programmatic targets *are* snap offsets, so they agree by construction. Far jumps stay `animated: false`. Fallback from that build log: toggle `scrollSnapType: 'none'` for the duration of an animated hop |
| **RNW `animated: true` is a silent no-op in some embedded/headless Chromium** — verified in the 2026-07-12 build log; the `7a80f15` redesign may have dropped the rAF workaround | Check whether the rAF ease-out loop still exists on the web path during P2; if not, restore it for animated hops. Affects e2e determinism, not just feel |
| Android `initialScrollIndex` landing at 0 | Existing `onContentSizeChange` one-shot correction and `onScrollToIndexFailed` fallback are index-agnostic — keep both verbatim |
| `rowHeight = height / 6` is fractional | Only the JS settle consumes offsets (floats fine). Not adopting `snapToOffsets` means no int-rounding requirement. `getItemLayout` stays exact-float, as it is today |
| Header live vs dimming settled disagree mid-drag | Accepted and documented above; one-line follow-up if it reads badly |
| Fetch source moves to settled month | Strictly fewer fetches; prefetch waves unchanged. Watch that a deep link still fetches before its first settle (it seeds `initialMonth` directly) |
| `bun test` vs CI jest | New tests import only `calendar-grid.ts` (no React/RN), as the existing suite does |

## Verification (end-to-end)

1. `cd app && bun run typecheck && bun run lint && bun run format:check`
2. `bun test src/utils/calendar-grid.test.ts` (+ existing suites)
3. Android: `bun run android:dev` — **hold mid-seam, week appears once**; swipe
   threshold unchanged; deep links; Today; rotation
4. Web: dev proxy `:8882` — hold mid-seam single week; wheel/touch/keyboard all
   settle on months
5. `tooling/e2e/run.sh` green

## Build log (2026-08-30)

- **P1 ✓** Ribbon helpers restored in `calendar-grid.ts`, adapted to Monday
  weeks; `weeksOfMonth` deleted; `landingIndex` reworked onto snap offsets.
  58 tests in `calendar-grid.test.ts`.
- **P2 ✓** `month-grid.tsx` rewritten: `MonthPage` gone, weeks are the list
  unit, shared 150ms settle timer, web listener block and `scrollerNode`
  deleted, CSS snap declared, both stale comment blocks removed.
- **P3 ✓** `month-screen.tsx` holds `settledMonth` alongside the live `month`;
  dimming and `useMonthEvents` both moved onto it.
- **P6 ✓** e2e: the `gridPage` helper — which existed *only* to disambiguate
  the doubled boundary cells — is now `grid`, plus two new steps (below).
- **P4 ✓ (Android, physical CPH2841 over wireless adb).** Driven with `adb
  shell input motionevent` so the gesture could be held with the finger still
  down — the state a normal `input swipe` cannot reproduce:
  - **Held mid-drag at the Aug→Sep seam: `31 | 1 Sept | 2 … 6` appears exactly
    once**, Aug 24–30 directly above it and Sep 7–13 directly below. This is
    the reported bug, gone.
  - Dimming held on August for the whole drag and flipped once on release —
    the locked decision, behaving as specified.
  - Release landed flush on September (Aug 31 row at the grid's top edge, six
    rows through Oct 5–11): one swipe, one month, unchanged feel.
  - A ~120px drag — under 15% of that seam's **4**-row gap — snapped back to
    September, exercising the variable-gap threshold on the narrower of the
    two gap sizes.
  Note: the device showed a CalDAV `UnknownHostException` for the tailnet host
  (the phone is not on the tailnet from where this ran); the grid rendered from
  its snapshot cache, which is orthogonal to the geometry under test.

**Environment note for the next run:** `bun run android:dev` fails from a
non-interactive shell — `JAVA_HOME` and `ANDROID_HOME` live in `~/.zshrc`,
which is not sourced. Export both (`$HOME/.jdks/jdk-17.0.19+10/Contents/Home`
and `$HOME/Library/Android/sdk`) before invoking it.

**Deviation — `isMonthStartWeek` dropped.** The plan had a predicate deciding
which rows web snaps to. That would have been a second, independent definition
of "a month starts here", free to drift from `monthStartWeekIndices`. The grid
instead builds a `Set` of the same rows the JS settle lands on, so both
platforms snap to one array. Replaced in the utils by `nearestSnapIndex`, a
bisect the live header needs on every scroll frame.

**Deviation — `buildWeekRange(months)`, not `buildWeekRange(today)`.** Building
the ribbon from `today` (as the pre-`7a80f15` version did) puts the first
month's start week *before* row 0, so `monthStartWeekIndex` goes negative for
it. Deriving the ribbon from the month ribbon makes "every month has a row, and
the last month still has six" true by construction; a test asserts it.

**Deviation — extra e2e step.** Beyond the duplication assertion the plan
called for, a step asserts the snap mechanism directly: `scroll-snap-type: y
mandatory` on the scroller, with `scroll-snap-align` on *some but not all*
rows. The sparseness is what separates month paging from week paging, and
nothing else in the suite would notice if it regressed to `pagingEnabled`.

**Pre-existing failure, not caused by this work.** `month-grid.spec.ts` fails
at the recurring-create step: saving leaves the editor open on "End must be
after the start". The suite ran at 22:33, so the create editor defaulted to a
23:00 start and a 00:00 end **on the same date** — the end date never rolls
forward past midnight. Verified by stashing this branch and re-running: the
baseline fails on the identical assertion. Every step before it passes on both.
Worth its own fix — it means creating an event after 23:00 is broken in the
app, not just in the test.

## Follow-up defects found by device testing (2026-08-30, same session)

The user reported "the whole thing flashes and reloads" on every swipe. Three
separate defects came out of chasing it; the first was pre-existing, the other
two were mine and had been masked by an unrelated e2e failure earlier in the
suite.

**1. Grid blanked on every fetch (pre-existing, `use-month-events.ts`).**
`setError(null)` ran at the *start* of every fetch, unmounting the error banner
for the duration of the request. The banner sits in the grid's measured flow,
so each attempt resized the grid pane, changed `rowHeight` (pane ÷ 6) and
forced the whole ribbon to re-lay-out — a fully blank grid for a frame or two,
on every settle *and* every 60s poll while offline. Isolated by tapping Retry
with no scrolling at all, which reproduced it exactly. Fixed by holding the
last error until a fetch actually succeeds, matching what `fetchedAt` already
does. Verified: four consecutive frames across a Retry are now byte-identical.

**2. CSS snap hijacked programmatic jumps (mine).** Exactly the hazard listed
in the risk table above. Today from December to August landed on **October** —
mandatory snap re-snapped the jump to the nearest row that happened to be
*mounted*, since the destination had not been virtualized in yet. Fixed with
the mitigation the 2026-07-12 build log already prescribed: `jumpTo` suspends
`scroll-snap-type` for the jump and restores it after `SNAP_RESTORE_MS`.

**3. Programmatic jumps never settled (mine, and the more serious one).**
Moving the fetch and the dimming onto the settled month created a path with no
settle in it: RNW's `scrollToOffset` does not emit a scroll event, so nothing
armed the settle timer. Today landed on the right month with **every day
dimmed and not one event fetched for it** — the header said August while the
grid was still focused on December. Confirmed by probing the settled month out
of the DOM (`settled = 2026-11`, `header = August 2026`) rather than guessing;
two earlier hypotheses (`extraData`, arming the settle inside `jumpTo`) were
wrong and were backed out. Fixed by having `scrollToMonth` report its own
destination — it knows it synchronously and should never have been asking the
scroll where it went. The same probe confirmed the settle timer is healthy for
real gestures: a wheel scroll moved both header and settled month correctly.

`extraData` was kept. It is not what caused #3, but a `FlatList` whose cells
draw from `focusedMonth` and `weekEvents` — both outside `data` — is relying on
undefined behaviour without it.

**Verification after all three.** Full e2e suite **passes** (the recurring-create
step included, now that the run is outside the late-evening window of the
end-time bug). On the phone: Today returns to August with correct dimming and
events; a held mid-drag shows the seam week once, with no blank frame; the
landing burst is frame-identical. Device network recovered mid-session, so the
healthy (no banner) path is verified too.

## Polish follow-ups (2026-08-31)

**Out-of-month day numbers are no longer bold.** `styles.dayNumber` forced
`fontWeight: 'bold'` on every day; muted days now fall back to the `small`
type's own 500, so a neighbouring month reads quieter in weight as well as in
colour. Today keeps full weight wherever it sits.

**The shading fades instead of snapping.** Chosen over animating every day
number: Reanimated styles cannot be shared between components, so per-cell
fading would mean ~7 animated styles per row × ~42 mounted rows, built and torn
down constantly as rows recycle during a scroll — cost on the exact hot path
the measurements above were protecting. Instead the out-of-month fill moved off
the individual cells into **two overlays per row**, one per month the week
touches (a week touches at most two), each fading its own opacity over
`DIM_MS`. Two animated values per row rather than seven, and no colour
interpolation. The overlays sit *behind* the cells so today's fill still paints
over the shading when today belongs to a neighbouring month. Shared values are
seeded at their settled value, so a row scrolling into view arrives already
shaded — only a change of focused month animates. The day-number colour and
weight still snap; that was the accepted trade.

Verified: e2e green, 186 unit tests green, and on device the two-block split
lands exactly on the boundary (in the Sep 28 row, `28 29 30` stay bold and
unshaded while `1 Oct 2 3 4` are shaded and lighter).
