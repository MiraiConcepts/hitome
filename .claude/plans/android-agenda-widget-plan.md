# Android Agenda Widget — Implementation Plan
Created: 2026-07-07
Status: COMPLETE — v0.2.3 VERIFIED on-device 2026-07-07 (user: widget self-updates
after in-app edits; foreground-resume pulls external events; dead-app tap opens;
no OOM). Three field bugs found and fixed during Phase E; see §Field debugging
(the load-bearing record — read before touching widget code or RNAW).

Follow-up decision (2026-07-07): **calendar stays HTTP-pull — no WebSocket**, even
after y-sweet lands for notes (y-sweet syncs Yjs docs, not Radicale changes; push
would still need a custom Radicale watcher). External-change freshness =
foreground revalidate + 3-min visible poll + best-effort 30-min widget cycle.
Revisit trigger: felt staleness pain in daily use, not available infrastructure.

## Context

First feature after v0.1.0: an Android home-screen **agenda widget** showing the **next 10
upcoming CalDAV events**. Decisions from the interview (2026-07-07):

- **Window:** next 10 from now — timed + all-day + in-progress, each recurring instance
  counts; 60-day horizon.
- **Freshness:** Android's ~30-min automatic cycle + refresh on app open + a **manual
  refresh tap target** on the widget.
- **Offline/failure:** keep last-good events with a small "updated HH:mm" line.
- **Tap:** whole widget opens the app's calendar screen (`app://calendar`).
- **Appearance:** match the app — orange accent (`#E66000`), row = time + title (+ location
  if it fits), system dark/light, ~4x2 resizable.
- **Workflow (trunk-only, user-stated):** commit straight to `main`, no branches, no local
  Android testing; verification happens in production via release → Obtainium. Web redeploys
  from every push to main, so each commit must keep web green.

## Research Summary

See `android-agenda-widget-research.md`. Load-bearing: RNAW **0.20.3** (≥0.20.3 mandatory —
earlier 0.20.x shipped a broken Expo plugin) on the open-ended RN ≥0.76 compat range;
new-arch since 0.16.0, dark mode since 0.19.0; RN 0.85/SDK 56 maintainer-untested (risk #1).
Config plugin + prebuild = zero CI workflow changes. Entry-point override required for the
task handler; polyfills and web-bundle safety are on us. `fetchMonth` is already a generic
range fetch; new code is a pure selector, a small cache, the widget UI, and the handler.
Net-new deps: `react-native-android-widget`, `expo-file-system`.

## Approach

Reuse the existing caldav layer untouched. All new code lives in `app/src/widget/`. The
headless task handler does: fetch range → select next 10 → write last-good cache → render;
on fetch failure it renders from cache. The app's calendar screen triggers a widget refresh
on load (covers "refresh on app open"). Pure logic (`selectUpcoming`, row formatting) is
unit-tested; native behavior is verified on-device after a release cut.

### Design Priorities (in order)
1. Minimal code / simplicity
2. Performance
3. Explicit and traceable code
4. Reusability / modularity
5. Readability / maintainability

## Implementation Phases

### Phase A: Dependencies + wiring — DONE
- [x] `bunx expo install react-native-android-widget expo-file-system` → RNAW 0.20.3,
      expo-file-system 56.0.8; `bun.lock` committed
- [x] `app.json`: widget config added; the plugin type DOES support `resizeMode`
      → `"horizontal|vertical"` (fully resizable)
- [x] New `app/index.ts` entry: `@/polyfills` → `expo-router/entry` → `@/widget/register`
- [x] `app/package.json`: `"main": "index.ts"`
- **Deviation:** no lazy `require` — platform-split modules instead
  (`register.android.ts` real / `register.ts` no-op), matching the repo's existing
  `.web.tsx` idiom; web bundle verified widget-free by grepping the export.
- Files: `app/package.json`, `app/bun.lock`, `app/app.json`, `app/index.ts`

### Phase B: Widget data layer (pure, tested) — DONE (all boxes; plus `format.ts`
for row labels, and `load.ts` as the shared fetch→cache pipeline)
- [ ] `app/src/widget/types.ts` — slim `WidgetEvent` (`summary`, `start`/`end` ISO strings,
      `allDay`, `location?`) + `WidgetCache { events: WidgetEvent[]; fetchedAt: string }`
- [ ] `app/src/widget/select-upcoming.ts` — pure: filter `end > now`, sort by `start`,
      slice(0, 10); CalEvent → WidgetEvent mapping
- [ ] `app/src/widget/cache.ts` — read/write one JSON file via `expo-file-system`
      (document dir), tolerant of missing/corrupt file
- [ ] `app/src/widget/fetch-upcoming.ts` — `getDefaultCalendar()` + `fetchMonth(now,
      now+60d)` + selector; returns events or throws (caller decides stale fallback)
- [ ] Tests for `select-upcoming` (timed/all-day/in-progress/recurring-instance ordering,
      limit, exclusive all-day end) in the existing jest style, runnable via `bun test`
- Files: `app/src/widget/{types,select-upcoming,cache,fetch-upcoming}.ts`,
  `app/src/widget/select-upcoming.test.ts`

### Phase C: Widget UI + task handler — DONE, with deviations:
- **Tap = `OPEN_APP`, not `OPEN_URI app://calendar`** — the calendar moved to the
  home route in the (previously uncommitted) home-screen refactor; `/calendar` is
  now a redirect, so a deep link adds nothing. `OPEN_APP` also sits on each list
  row (root clickAction may not cover ListWidget item areas).
- **Refresh-on-open lives in `_layout.tsx`** (root layout mount), not the calendar
  screen — fires once per app launch via platform-split `app-refresh` modules.
- **Polyfills load in `index.ts`**, the bundle entry — strictly earlier than the
  task-handler module, so no import there.
- Component file is `agenda.tsx` exporting `renderAgenda` (light/dark pair —
  RNAW's `WidgetRepresentation` supports `{ light, dark }` natively).
- [ ] `app/src/widget/agenda-widget.tsx` — root `FlexWidget` with `clickAction: 'OPEN_URI'`
      → `app://calendar`; header row: "updated HH:mm" (from `toTimeString`) + refresh glyph
      with `clickAction: 'REFRESH'`; `ListWidget` of compact rows (day + time via existing
      date utils, title, location if present); light/dark palettes from
      `Colors`/`AccentColor`; empty state ("No events in the next 60 days") and
      unconfigured state (`davConfigured === false`)
- [ ] `app/src/widget/task-handler.tsx` — imports `@/polyfills` first; on
      WIDGET_ADDED / WIDGET_UPDATE / WIDGET_RESIZED / WIDGET_CLICK('REFRESH'):
      fetch → cache → render; on error: render cache (stale timestamp shows it)
- [ ] Refresh-on-app-open: `requestWidgetUpdate` fire-and-forget from the calendar screen's
      mount (Android only)
- Files: `app/src/widget/{agenda-widget,task-handler}.tsx`, small touch in
  `app/src/app/calendar.tsx` (or `use-month-events.ts`)

### Phase D: Checks + land on main — DONE
- [x] typecheck · strict lint · prettier · 29 pure tests green (`bun test src`)
- [x] `bunx expo export --platform web` clean; web bundle contains zero widget code
- [x] Pushed as 3 commits (`201ee4e` home refactor, `ac79d70` widget, `ea40e50` docs)
- [x] `gh workflow run 'Android APK'` triggered (run 28815520295) — RNAW-on-RN-0.85
      proof pending
- **Deviation:** the tree also carried the user's uncommitted home-screen refactor;
  user chose "push everything", so it landed as its own commit under the widget.

### Phase E: Release cut + on-phone verification (separate go/no-go)
- [ ] Bump `app.json`: `expo.version` → `0.2.0`, `android.versionCode` → 2; push
- [ ] `gh workflow run 'Android APK'` → green → `./tooling/android-builder/sign-release.sh`
      (local keystore signs + publishes the GitHub Release)
- [ ] Obtainium updates on the phone; verify: widget in picker → add 4x2 → next-10 list
      renders → tap opens calendar → refresh tap refetches → airplane-mode shows stale +
      timestamp → dark/light both readable
- Files: `app/app.json`

## Edge Cases & Error Handling
- Fetch failure / off-tailnet → render last-good cache; "updated HH:mm" conveys staleness.
- No cache + fetch failure (first add while off-tailnet) → friendly "can't reach calendar"
  state, retries next cycle.
- `EXPO_PUBLIC_DAV_URL` unset (local debug builds) → explicit "not configured" widget state.
- Fewer than 10 events in 60 days → show what exists; zero → empty state.
- All-day events: exclusive end already normalized in ics.ts; rows show "all day", no time.
- Corrupt/missing cache file → treated as empty, overwritten on next success.
- ListWidget row height must stay ≤ widget height → single-line compact rows.

## Summary (2026-07-07, phases A–D)

Landed on main as `ac79d70` (widget) on top of `201ee4e` (the user's home-screen
refactor, pushed together by user choice) and `ea40e50` (docs). New module
`app/src/widget/` (10 files + 2 tests): pure selector + formatter, expo-file-system
last-good cache, shared fetch→cache pipeline, light/dark JSX tree, headless task
handler; entry moved to `app/index.ts`; refresh-on-open in `_layout.tsx`;
platform-split keeps web/iOS widget-free (verified in the export). Checks: typecheck,
strict lint, prettier, 29 pure tests, clean web export, CI + Web image + a
17-min cold APK smoke build all green. Key deviations recorded per phase above
(OPEN_APP over deep link, platform-split over lazy require, polyfills at entry).

## Field debugging (Phase E, 2026-07-07) — on-device via wireless adb (OnePlus
CPH2841, ColorOS/OxygenOS, 560dpi, 256 MB app heap cap, Lawnchair launcher)

Three distinct bugs, each confirmed by logcat evidence before fixing:

1. **Blank widget — React Compiler vs RNAW's raw render** (fixed v0.2.1, `a47caf9`).
   `reactCompiler: true` (app.json experiments) memoizes components with a hook;
   RNAW calls widget components as raw functions (no React renderer) → logcat:
   "Invalid Hook Call detected in Agenda". Fix: `'use no memo';` file directive in
   `src/widget/agenda.tsx`. ANY new file defining widget JSX components needs the
   same directive.

2. **All taps dead — ColorOS kills background-spawned processes** (fixed for
   OPEN_APP in v0.2.2, `2c1974a`). RNAW routes every click (incl. OPEN_APP) as a
   broadcast → app receiver → `startActivity()`. Tap with dead app = background
   process spawn, which ColorOS's cleaner kills ~2 s in (logcat: "Process
   <app package id> has died: prcl TRNB" — OplusHansManager). PendingIntents
   showed `sent=true`: taps fired, receiver died. Battery toggles/deviceidle
   whitelist did NOT help. Fix: `app/patches/react-native-android-widget@0.20.3.patch`
   (bun patchedDependencies, compiled by CI prebuild) — OPEN_APP clickables get a
   direct `PendingIntent.getActivity(launchIntent)`, launcher-fired like any
   native widget (Etar comparison). Upstream: same undiagnosed symptom is
   sAleksovski/react-native-android-widget#108 (MIUI, closed for lack of logs);
   #33 has the maintainer describing the slow path. TODO: file upstream issue
   with this evidence + patch. NOTE the patch is keyed to 0.20.3 — re-verify on
   any RNAW upgrade.

3. **App OOM-crash right after widget-tap launch** (fixed v0.2.3, `674d120`).
   RNAW renders full widget + every ListWidget row as ARGB bitmaps, ×2 for the
   light/dark pair (`CollectionView.getBitmap`); our refresh-on-open fired on
   root-layout mount, stacking the bitmap burst on app-boot allocations → past
   the 256 MB heap cap → `OutOfMemoryError`, process killed. Intermittent (timing
   race) — "it went away" means dormant, not fixed. Fix: refresh deferred 5 s
   after mount (`_layout.tsx`) + widget resize capped 420×350dp (app.json) to
   bound worst-case bitmaps.

**CLOSED — widget background auto-refresh: ACCEPTED as foreground-only
(user decision 2026-07-07).** Measured: over multiple hours untouched, the
widget's fetchedAt stamp never advanced — ColorOS kills every 30-min tick's
process spawn (~2 s, before RN finishes booting), so effectively zero background
refreshes complete on this device. Battery exemptions did not help. Accepted
behavior: the widget refreshes on foreground triggers only (app open/resume,
in-app mutations, ↻ while the process lives) and otherwise shows last-good cache
with its honest timestamp. Untried ideas, if ever reopened: recents-lock the app
(keeps the process cached so ticks skip the fatal spawn), or patch RNAW's
WorkManager job to expedited.

## Risks & Open Questions
- ~~**RNAW on RN 0.85/SDK 56 is maintainer-untested**~~ **RESOLVED** (2026-07-07):
  builds green AND verified working on-device through v0.2.3 (render, dark mode,
  tap-to-open from dead app).
- **Headless timeout unverified** — cold fetch is ~6 round-trips; if updates silently miss,
  suspect the native task timeout first. Cache limits blast radius to staleness.
- `resizeMode`/preview not confirmed as Expo-plugin fields — inspect the package's TS types
  in Phase A; resizable is nice-to-have, not blocking.
- Dark-mode mechanism (v0.19.0+) details unverified — style both palettes; verify on device.
- `expo-file-system` in the headless context is expected to work (native module in the same
  bundle) but is only proven on device.
- Widget must never touch credentials — it inherits the credential-less origin; nothing to
  do, just don't add auth (memory: caldav-auth-architecture).
