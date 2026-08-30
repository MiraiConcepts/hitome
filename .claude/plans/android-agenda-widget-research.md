# Android Agenda Widget — Research (versions + verified facts)

> As-of: 2026-07-07. Companion to `android-agenda-widget-plan.md`. Sources: official docs
> (saleksovski.github.io/react-native-android-widget), the GitHub releases page, RN headless-JS
> docs, and a codebase scan — the deep-research verification pass was cut short by a session
> usage limit, so every load-bearing claim below was re-verified by direct fetch; items that
> remain unverified are explicitly marked.

## 1. Library verdict — react-native-android-widget is GO (with one caveat)

- **Pin `react-native-android-widget@0.20.3`** (2026-05-02). 0.20.3's only change: "Added
  missing app.plugin.js" — earlier 0.20.x npm artifacts shipped a **broken Expo config
  plugin**. Never pin below 0.20.3.
- **Compatibility:** official table says RNAW **0.15.0+ for RN ≥ 0.76** (open-ended range that
  includes RN 0.85). New Architecture support landed in 0.16.0; dark-mode widgets in 0.19.0;
  RN 0.83 explicitly supported in 0.18.0.
- **Caveat:** no release note declares RN 0.85 / Expo SDK 56 (latest explicit: RN 0.83, Expo 55
  canary example app). Inside the declared range but maintainer-untested — acceptable because
  the CI APK → phone is the test bed (trunk-only workflow). Fallback if broken: pin lower RNAW
  or native Glance module (not researched further; decide only if needed).

## 2. Expo config plugin (verified against docs/tutorial/register-widget-expo)

`app.json` → `plugins: [..., ['react-native-android-widget', widgetConfig]]`. Prebuild
generates the manifest `<receiver>` (APPWIDGET_UPDATE + per-app WIDGET_CLICK intent filter) and
a `res/xml` appwidget-provider per widget. Verified widget config fields:

| Field | Notes |
|---|---|
| `name` | internal identifier (widget class is generated under `<package>.widget`) |
| `label`, `description` | widget-picker text |
| `minWidth` / `minHeight` | dp strings, Android ≤ 11 sizing |
| `targetCellWidth` / `targetCellHeight` | numbers, Android 12+ cell sizing |
| `previewImage` | optional path (skip for PoC) |
| `updatePeriodMillis` | **hard floor 1_800_000 (30 min)** — Android platform minimum |

Top-level `fonts: [...]` also exists. `resizeMode`/`widgetFeatures` were NOT confirmed as
plugin fields (a claim including them was refuted 0–3) — check `WithAndroidWidgetsParams`
TS type at install time; bare-RN provider XML shows `android:resizeMode` exists natively.

## 3. Task-handler registration for an expo-router app (verified)

Change `app/package.json` `"main"` from `"expo-router/entry"` to a custom `index.ts`:

```ts
import 'expo-router/entry';
import { registerWidgetTaskHandler } from 'react-native-android-widget';
import { widgetTaskHandler } from './src/widget/task-handler';
registerWidgetTaskHandler(widgetTaskHandler);
```

**Local caveats the docs don't cover:**
- **Polyfills:** tsdav needs `@/polyfills` (btoa/atob, TextEncoder), today loaded as the first
  line of `src/app/_layout.tsx` — a headless widget run never passes through `_layout.tsx`, so
  the entry (or task-handler module) must import `@/polyfills` FIRST.
- **Web bundle:** the same `main` serves the web build; importing RNAW's native module on web
  is a breakage risk. Guard registration behind `Platform.OS === 'android'` with a lazy
  `require`, and prove `bunx expo export --platform web` still builds before pushing (the web
  Docker image runs the same export).

## 4. Task handler behavior (verified except where flagged)

- Handler receives `widgetAction`: `WIDGET_ADDED`, `WIDGET_UPDATE` (fires on the
  updatePeriodMillis cycle), `WIDGET_RESIZED`, `WIDGET_CLICK` (custom clickActions only);
  re-renders via `props.renderWidget(<Widget/>)`.
- Async work incl. `fetch` is supported (docs show `await fetch()` inside a refresh
  WIDGET_CLICK — exactly our manual-refresh pattern). RN headless-JS allows arbitrary
  non-UI async work.
- **Unverified:** the native headless-task timeout RNAW configures (RN docs' generic example
  is 5 s). Cold CalDAV fetch is ~6 round-trips on-tailnet (see §6) — likely fine, but if
  updates silently die, this is the first suspect. Mitigation: last-good cache means a missed
  cycle only means staleness.
- Updates throttled to ≥ 30 min regardless of configured value; app-side
  `requestWidgetUpdate` can render on demand (e.g. on app open).

## 5. Rendering + clicks (verified)

- **`ListWidget` is scrollable**, accepts FlexWidget/TextWidget children, **per-item
  clickAction supported**. Constraint: each item's height ≤ ListWidget height (keep rows
  compact).
- `clickAction` on any primitive. `OPEN_APP` (native, no data) opens the app;
  `OPEN_URI` `{ uri }` supports app deep links — expo-router resolves them, so the whole-widget
  tap uses `OPEN_URI` → **`app://calendar`** (scheme `app`, route `/calendar` — both verified
  in-repo). Custom strings (e.g. `'REFRESH'`) arrive in the handler as `WIDGET_CLICK` with
  `props.clickAction`. clickAction needs Android 7+.
- Dark mode: built-in since 0.19.0 — mechanism details unverified; check the primitive props
  (light/dark color variants) at install time and style both palettes.

## 6. Codebase facts (verified by sub-agent scan, spot-checked)

- **`fetchMonth(rangeStart, rangeEnd)` in `app/src/caldav/events.ts` is a generic range fetch**
  (misnamed): CalDAV time-range REPORT + `ical-expander` expansion; overlap-based, so
  in-progress events already come back from `(now, now+60d)`. All-day `end` is already the
  exclusive JS-Date boundary → `end > now` is the correct liveness test for both kinds. It does
  NOT sort or limit — the widget needs a pure `selectUpcoming(events, now, limit)`.
- `CalEvent`: `id`, `url`, `etag`, `uid`, `summary`, `start`, `end`, `allDay`, `location?`,
  `description?`, `raw`.
- **Cold fetch ≈ 6 HTTP round-trips** (tsdav discovery → principal → home-set → calendars →
  calendar-query → multiget); `client.ts` caches per-JS-context, so every widget cycle is cold.
- `EXPO_PUBLIC_DAV_URL` is Metro-inlined at bundle time — headless code in the same bundle sees
  the same baked URL (CI sets it from Actions var `<APP>_DAV_URL` on the gradle step, which
  bundles). `davConfigured` exported for the unconfigured case.
- **No storage lib installed** (no AsyncStorage/MMKV/expo-file-system). Last-good cache is a
  net-new dependency → **`expo-file-system`** (Expo-SDK family, JSON blob, installed via
  `bunx expo install`).
- Theme: `AccentColor '#E66000'`, `Colors.light/dark` in `app/src/constants/theme.ts` (note: it
  imports `@/global.css` + RN `Platform` — fine in widget JS context). Time helpers:
  `toTimeString` ('HH:MM'), `toDateString` in `app/src/utils/date.ts` (pure).
- CI pipeline needs **no workflow changes**: prebuild runs config plugins fresh each run;
  `patch-signing.mjs` only touches `build.gradle` (no conflict with manifest edits). Only hard
  requirement: **commit the updated `bun.lock`** or `--frozen-lockfile` fails.
- Tests: jest-expo via `bun run test` in CI; locally jest is broken under bun → `bun test
  <files>` on pure modules. Existing style: plain describe/it, no mocks, colocated or
  `__tests__/`. `selectUpcoming` fits as a pure module with zero tsdav/expo imports.
- Current version: `expo.version 0.1.0`, `versionCode 1` → release cut bumps to 0.2.0 / 2.
