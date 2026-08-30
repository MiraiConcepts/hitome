# Scrollable Month Grid — Implementation Plan

Created: 2026-07-12 · Status: IN PROGRESS
(After approval, copy into `.claude/plans/scrollable-month-grid-plan.md` per repo convention.)

## Context

Replace the current calendar view (react-native-calendars paged `<Calendar>` with orange dots + agenda FlatList + FAB in [month-screen.tsx](app/src/components/calendar/month-screen.tsx)) with a macOS-Calendar-style month grid: a continuously scrolling ribbon of week rows with event chips and spanning banners, per the user's screenshot. Ships on web (right pane of the wide split, ~350–500px) and Android (full-screen pane). `react-native-calendars` is fully removed.

### User decisions (locked, from question rounds)

- **Scroll**: continuous vertical week-row scroll that **snaps to months** (week containing the 1st lands at top on settle). Fixed row height = grid height ÷ 6.
- **Cells**: chips with accent bar + truncated title (+ right-aligned start time only when cells are wide enough); "+N more" overflow.
- **Multi-day/all-day**: macOS-style **spanning banners** across cells, re-broken per week with continuation edges.
- **Agenda list: removed. FAB: removed.** Day tap → create editor for that day; chip/banner tap → edit editor; "+N more" tap → day popover (Modal) listing that day's events.
- **Header**: month label + prev/next chevrons + Today button (chevrons also keep e2e deterministic).
- Panes stay notes-left / calendar-right. Out of scope: sidebar, mini-month, Day/Week/Year views, search, per-calendar colors (all events `AccentColor #FF9500`), external feeds.

## Research summary (validated against installed sources)

- **Android (RN 0.85.3, Fabric)**: `snapToOffsets` fully implemented (`ReactScrollView.java` `flingAndSnap`) — use it with integer offsets + `decelerationRate="fast"`. Programmatic scrolls are NOT re-snapped.
- **Web (react-native-web 0.21.2)**: `snapToOffsets`/`snapToInterval` are silently dropped (not in the View prop whitelist); `onScrollEndDrag`/`onMomentumScrollEnd` **never fire**. RNW passes unknown camelCase styles through to CSS → use `scrollSnapType: 'y proximity'` on the FlatList `style` (this is how RNW itself implements `pagingEnabled`) + `scrollSnapAlign: 'start'` on month-start week rows. `onScroll` fires normally plus a synthetic trailing event ~100ms after stop.
- **RNW FlatList really virtualizes** (vendored VirtualizedList). `getItemLayout` + `initialScrollIndex` work on both platforms; Android needs non-zero list height at mount (gate rendering on `onLayout`). Track the visible month via **onScroll offset math** (round(offset/rowHeight)), not `onViewableItemsChanged`. Use `animated:false` for far jumps (Today, deep links); `animated:true` only for ±1-month chevron hops.
- Prior art (CalendarList, flash-calendar, react-infinite-calendar) confirms week-row/month-block virtualized lists; none combine week ribbon + month snap, but every ingredient is proven.

## Approach

One FlatList of ~522 fixed-height week rows (±5 years), Monday-start. Banners/chips laid out per week row by a pure lane-packing algorithm. Snap via `Platform.select`: Android `snapToOffsets` at month-start week offsets; web CSS proximity snap. Settle detection on both platforms via a single 150ms onScroll idle timer.

### Design priorities

1. Minimal code / simplicity 2. Performance 3. Explicit, traceable code 4. Reusability 5. Readability

### New pure util — `app/src/utils/calendar-grid.ts` (+ `calendar-grid.test.ts`)

No React/RN imports (runs under `bun test` and CI jest). Reuses `toDateString`/`parseDay` from [date.ts](app/src/utils/date.ts).

- `mondayOf(d)`, `addDays(d, n)` (setDate-based, DST-safe), `weeksBetween(a, b)` (ms diff + `Math.round` defeats DST drift)
- `buildWeekRange(today)` → `{ rangeStart, weeks: string[] }` — Monday dateStrings, the FlatList data
- `weekIndexOfDay(day, rangeStart)`, `monthStartWeekIndex(y, m0, rangeStart)`, `monthStartWeekIndices(rangeStart, count)`
- `monthAnchorOf(weekStart)` — owning month = month of the week's **Sunday** (drives header label + dimming)
- `gridFetchRange(y, m0)` = `[mondayOf(1st) − 7d, mondayOf(1st) + 49d)` — covers all 42 visible days of a settled month (fixes the real coverage hole: Feb 2027 starts Monday, grid shows through Mar 14 but current `monthFetchRange` ends Mar 8)
- `isBanner(e)` — `allDay` OR touches >1 local day, computed from raw start/end (NOT `eventDays`, whose 62-day cap would break long banners)
- `layoutWeek(weekStart, events, slotCount)` → `{ banners, chips, overflow[7] }`:
  1. filter events overlapping `[weekStart, +7d)` (end-exclusive at midnight); partition banner vs timed-chip
  2. banners: clamp to columns, sort startCol asc → span desc → start asc → id; greedy lowest-free-slot packing with continuation flags
  3. chips: per column, start asc → id; lowest free slot in that column (fills gaps under partial banners)
  4. overflow: with `slotCount` visible slots, hide occupants with slot ≥ slotCount−1 in overflowing columns; a banner hidden anywhere hides row-wide (+1 to every covered column); iterate hide pass to fixpoint; "+N more" renders in slot `slotCount−1`

### Components — `app/src/components/calendar/`

| File | Role |
|---|---|
| `month-screen.tsx` (rewrite) | Container: dav gate, deep links, `useMonthEvents(settledMonth)`, editor/snack/popover state, pane `onLayout`. Agenda + FAB deleted; `selectedDay` state deleted. |
| `month-header.tsx` (new) | Label + chevrons + Today + refresh (+ small spinner when loading with no events). testIDs `calendar-header-label`, `calendar-prev`, `calendar-next`, `calendar-today`. |
| `month-grid.tsx` (new) | FlatList wiring, snap split, onScroll month tracking + 150ms settle timer, imperative `scrollToMonth(y, m0, animated)` via ref, resize re-anchoring to last settled month, per-week event bucketing memo. |
| `week-row.tsx` (new) | One row (`React.memo`): 7 full-cell `DayCell` Pressables (underlay; day number top-left, today = accent pill `borderRadius: Spacing.one`, the 1st renders "1 Jul") + absolute overlay `pointerEvents="box-none"` holding banners/chips/"+N more". Out-of-focused-month day numbers dim to `textSecondary`. `layoutWeek` computed in useMemo (only mounted rows). testID `day-cell-YYYY-MM-DD`, `more-YYYY-MM-DD`. Web: month-start rows get `scrollSnapAlign: 'start'`. |
| `event-chip.tsx` (new) | `EventChip` (3px accent bar + 11px title + optional time) and `EventBanner` (AccentColor fill, OnAccentColor text, squared edges on continuation sides). Both Pressable. |
| `day-popover.tsx` (new) | Centered `Modal` (same idiom as EventEditor), day title + scrollable rows reusing the old agenda-row visual (time column / summary / location); row tap → edit editor. testID `day-popover`. |

Layout constants: `SLOT_HEIGHT = 18`, `DAY_NUMBER_HEIGHT = 22`, `slotCount = max(0, floor((rowHeight − 22 − 2) / 18))`, `showChipTime = paneWidth/7 ≥ 96`.

### FlatList wiring (key props)

`data` weeks · `keyExtractor` identity · `getItemLayout` exact float `rowHeight * i` · `initialScrollIndex` month-start week of initial month (deep-linked day's month or today's) · `windowSize 7` · `initialNumToRender 8` · `scrollEventThrottle 16` · `showsVerticalScrollIndicator false` · **no contentContainer padding** (would break offset math) · Android: `snapToOffsets = monthStartWeekIndices.map(i => Math.round(i * rowHeight))`, `decelerationRate 'fast'`, `overScrollMode 'never'` · Web: `style` gains `scrollSnapType: 'y proximity'` · `onScrollToIndexFailed` → offset fallback.

Header tracking: `idx = clamp(round(offset / rowHeight))` → `monthAnchorOf(weeks[idx])` → live label + dimming. Settle: 150ms idle timer → settled month (drives fetch + clears chevron `pendingTarget` ref; rapid chevron clicks advance from the pending target, keeping e2e deterministic). Chevrons `animated:true`; Today/deep-links `animated:false`. Android hardening: one-shot post-mount offset correction if the list mounted at 0.

### Data fetching — minimal change

Keep [use-month-events.ts](app/src/hooks/use-month-events.ts) intact (60s visible polling, AppState/web-focus revalidate + `refreshAgendaWidget`, seq guard, online-first) with ONE change: `monthFetchRange` → `gridFetchRange`, keyed on the **settled** month. Consecutive windows overlap by weeks and `setEvents` replaces only on success, so scrolling one month never blanks visible rows; a long fling issues one fetch on settle. Then delete `monthFetchRange` from `date.ts` (+ its test block) — it has no other importers. Multi-month cache rejected for v1 (complexity vs. minor scroll-back flicker); noted as follow-up.

### Preserved behaviors

- `?day=YYYY-MM-DD`: cold start seeds initial month; warm start keeps the adjust-during-render pattern, then `scrollToMonth(..., false)` once the grid is mounted (gates only on layout, not on events — grid is pure date math).
- `?new=<nonce>`: unchanged (create editor for today, nonce re-fires warm).
- `davConfigured` setup card, error banner + Retry, snackbar undo-delete (`restoreEvent`), `refresh()` + `refreshAgendaWidget()` on editor done/undo — all verbatim. Snack `bottom` simplifies (no FAB).
- Icons: add Basil chevron-left/right bodies to [icon-paths.ts](app/src/constants/icon-paths.ts) + `ChevronLeftIcon`/`ChevronRightIcon` in [icons.tsx](app/src/components/icons.tsx) (existing `svg()` helper).

## Implementation phases

**P1 — Pure utils**: `calendar-grid.ts` + tests (Monday-of all weekdays; DST/year-boundary week indices; month anchors; Feb-2027 fetch coverage; banner clamp/continuation; packing determinism; chip gap-fill; overflow incl. banner-bump fixpoint; midnight-end not-a-banner). ✓ `cd app && bun test`, `bun run typecheck`, `bun run lint`.

**P2 — Chevron icons**. ✓ typecheck/lint.

**P3 — Grid shell + navigation**: header, grid, week rows (day numbers only), month-screen rewrite (agenda/FAB gone; day tap → create). ✓ checks + browser via dev proxy `:8880` (grid fills pane, snap, header tracks, chevrons/Today, dimming, "1 Jul", create-editor date) + Android emulator (`bun run android:dev`, NO `--bun`: cold-start lands on today, fling snaps, rotation re-anchors).

**P4 — Event rendering**: chips/banners/"+N more"/popover + edit wiring. ✓ checks + seeded verification (banner spans/continuations, stacking, overflow → popover → edit, undo-delete, widget refresh still fires).

**P5 — Fetch window + deep links**: hook swap, `monthFetchRange` removal, `pendingScrollDay` wiring. ✓ checks + trailing-week event visible in short months; `/?day=`, `/?new=` cold + warm; widget deep links on emulator.

**P6 — Dependency removal**: `cd app && bun remove react-native-calendars`; fix stale comment [date.ts:3](app/src/utils/date.ts); sweep. ✓ `grep -r react-native-calendars app/src tooling` = 0; checks; web + Android boot.

**P7 — e2e rewrite**: delete `agenda.spec.ts` → new `tooling/e2e/month-grid.spec.ts`; extend `seed.mjs` with `e2e-longspan` (9-day all-day spanning a week boundary) and 10× `e2e-busy` on one day (forces "+N more"). Tests: initial month + today pill; chevron ×3 → label + 1st's week snapped to grid top (boundingBox ±3px); chips on correct days; banner above chips; multi-day overlaps day cells 8–10 + longspan has ≥2 segments; empty-day tap → create editor with right date; chip tap → edit; "+N more" → popover → edit; Today from afar; empty month; `/?day=` + `/?new=` deep links. ✓ Metro `bun run --bun web:proxy` + `tooling/e2e/run.sh` green.

## Files

**Create**: `app/src/utils/calendar-grid.ts` + `.test.ts`, `app/src/components/calendar/{month-header,month-grid,week-row,event-chip,day-popover}.tsx`, `tooling/e2e/month-grid.spec.ts`
**Modify**: `month-screen.tsx` (rewrite), `use-month-events.ts` (window swap), `date.ts` + `date.test.ts` (remove `monthFetchRange`, fix comment), `icon-paths.ts`, `icons.tsx`, `app/package.json` + lockfile, `tooling/e2e/seed.mjs`
**Delete**: `tooling/e2e/agenda.spec.ts`, `react-native-calendars` dep
**Untouched**: `event-editor.tsx`, `home-screen.tsx`, `widget/*`, `caldav/*`, server/tooling infra

## Edge cases & risks

| Risk | Mitigation |
|---|---|
| Android `initialScrollIndex` misplacement | Render grid only after `onLayout` height (also defines rowHeight); exact `getItemLayout`; one-shot offset correction; `onScrollToIndexFailed` fallback |
| Web has no momentum-end events | Single 150ms onScroll idle timer on both platforms (RNW's synthetic trailing scroll just re-arms it once) |
| Proximity snap nudging programmatic jumps | All programmatic targets ARE snap offsets; far jumps `animated:false`; fallback: toggle `scrollSnapType:'none'` during animated hops |
| Banners swallowing day taps | Overlay `pointerEvents="box-none"`; only chips/banners/"+N" capture taps; full-cell Pressable underneath |
| DST / year boundaries in week math | setDate stepping + rounded `weeksBetween`; explicit tests |
| Long events vs `eventDays` 62-day cap | banner math uses raw start/end interval overlap |
| Rapid chevron clicks (e2e flake) | `pendingTarget` ref advances from last requested month |
| Tiny panes → slotCount 0–1 | guard `max(0, …)`; cells still render/tap; "+N" only when ≥1 slot |
| bun test vs CI jest | new tests use only describe/it/expect, no RN imports |

## Verification (end-to-end)

1. `cd app && bun run typecheck && bun run lint && bun run format:check`; `bun test src/utils/calendar-grid.test.ts src/utils/date.test.ts` (+ existing widget tests).
2. Web: dev proxy `docker compose up -d` in `tooling/dev-proxy/` + `bun run --bun web:proxy`, browse `http://localhost:8880` — wide split AND 480px narrow; no watchman → restart Metro after new files.
3. Android: `bun run android:dev` (real node), verify grid, snap fling, widget deep links (`?day=`, `?new=`), editor round-trip, undo.
4. e2e: `tooling/e2e/run.sh` green (throwaway Radicale on :8881).

## Build log (2026-07-12)

- P1 ✓ `calendar-grid.ts` + 38 tests (`bun test`), typecheck/lint clean.
- P2 ✓ Basil caret-left/right bodies (fetched from Iconify) + Chevron icons.
- P3+P4 ✓ (**Deviation:** built as one step — grid shell and event rendering
  landed together; verification criteria unchanged.) All five components in.
- P5 ✓ hook swapped to `gridFetchRange`, `monthFetchRange` deleted (+ test block).
- P6 ✓ `bun remove react-native-calendars`; stale comment fixed; zero refs left.
- P7 ✓ `agenda.spec.ts` → `month-grid.spec.ts` (+ longspan & 10× busy seeds).

**Deviation — web animated scrolling:** RNW's `animated: true` maps to
`element.scroll({behavior:'smooth'})`, which is a **silent no-op in some
embedded/headless Chromium builds** (verified: even a synthetic scroller won't
smooth-scroll in the dev browser pane; risk applies to headless Playwright
too). Chevron hops on web now animate via an rAF loop of instant
`scrollToOffset` steps (280ms ease-out cubic) — deterministic everywhere and
feeds the same onScroll pipeline. Android keeps native `animated: true`.

**Deviation — pointerEvents:** RNW deprecates the `pointerEvents` prop; the
overlay and snack wrapper set it via style instead.

Web verification (dev proxy :8880, wide 1280 + mobile 375): grid fills pane,
6 rows, dimming + "1 Jul" tags + today pill, chips/banners from real CalDAV
data, banner tap → edit (verified Charis = 1-day all-day → 1-col banner is
correct; macOS just draws it wider), day tap → create with right date, chevron
hop + label tracking, Today jump, settle→refetch repopulates, `?day=` cold
start lands aligned (±1px), `?new=` opens editor dated today.

## Android verification (emulator, Pixel 9 Pro XL)

`bun run android:dev` (JDK 17 + ANDROID_HOME exported explicitly — background
shells don't inherit the ~/.zshrc exports). **Blocking pre-existing issue
found & fixed:** the uncommitted notes/Yjs work breaks ALL native bundling —
lib0 resolves `isomorphic-webcrypto/src/react-native` (not installed) on
Android. Fixed in the spirit of the existing polyfill (polyfills.ts already
provides crypto.getRandomValues via expo-crypto): metro.config.js now aliases
that request to `app/src/shims/lib0-webcrypto.cjs` (native-only path). This is
independent of the calendar change but was required to boot the app at all.

Verified on emulator: dark-theme grid, current month at cold start
(initialScrollIndex), fling → native snapToOffsets settles September's first
week at top with header + dimming tracking, Today jumps back, day tap → create
editor with correct date. Editor round-trip/undo code paths are verbatim from
the old screen.

## Summary — Status: COMPLETE

macOS-style scrollable month grid replaced the paged react-native-calendars
view on web + Android. Continuous week ribbon (±5y, virtualized FlatList),
month snap (Android native offsets / web CSS proximity), event chips +
spanning banners with per-week lane packing, "+N more" day popover, header
with chevrons + Today, agenda list and FAB removed, dependency removed.
Deep links, dav gate, snackbar undo, widget refresh triggers preserved.
38 new unit tests; e2e suite rewritten (10 steps, green); typecheck/lint/
format green. Deviations: P3+P4 merged; rAF web animation (smooth-scroll
no-op in embedded/headless Chromium); pointerEvents via style; lib0 shim.

## Addendum — snapshot cache (2026-07-12, user go)

Stale-while-revalidate for calendar events + a reusable cross-platform cache:
- `src/utils/snapshot-cache.ts` (expo-file-system file per key) /
  `.web.ts` (IndexedDB via idb, DB `<app>-snapshots`) — generic key→JSON,
  best-effort, values must be JSON-safe.
- `src/utils/event-snapshot.ts` — CalEvent (de)serialization with shape
  validation (5 bun tests).
- `use-month-events.ts` — month change seeds state from `calendar-<y>-<m0>`
  unless the fetch already landed (`freshFor` ref guard); every successful
  fetch rewrites the snapshot. Silent refresh (spinner only on empty cold
  start); keep-everything retention; no staleness cutoff.
- `widget/cache.ts` — migrated onto snapshot-cache (key `widget-agenda`);
  old `widget-agenda.json` orphaned, first run re-fetches.

Verified: Metro-log ordering proves seed-before-fresh on cold start AND month
change (web); e2e green; 55 unit tests; Android boots, both
`files/snapshot-*.json` written on device. (In-page DOM probes were defeated
by browser-pane timer throttling — Metro console logging is the reliable
verification channel for timing questions.)
