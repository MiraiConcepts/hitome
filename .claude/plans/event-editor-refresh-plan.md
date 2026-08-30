# Event Editor Refresh — Implementation Plan

Created: 2026-07-19 · Status: COMPLETE
Repo: `/Users/addison/Desktop/<repo>` (work happens under `app/` unless noted)

## Context

The event editor ([event-editor.tsx](app/src/components/calendar/event-editor.tsx)) is the deliberately dependency-free first cut: a centered RN `Modal`, raw `TextInput`s for date (`YYYY-MM-DD`) and times (`HH:MM`), free-form location, no recurrence, no alarms, single-day events only. This refresh turns it into a polished, core-complete editor on both Android and web: date-as-title in brand color, native pickers, bottom sheet on narrow screens, recurrence (RRULE), a reminder (VALARM) that the app itself fires, and Photon-backed location autocomplete.

The ICS layer already round-trips foreign RRULE/VALARM losslessly (`editPreserving` mutates the parsed tree; byte-identical DTSTART on title-only edits is test-enforced) and already expands recurring events for display — this plan adds the **write path** and the UI.

## Decisions (locked with user, 2026-07-19)

| Topic | Decision |
|---|---|
| Header | Event's start date as title (e.g. "Sat, 19 Jul" — `dayLabel` format), `BrandColor` #F5820D, in **both** create and edit modes, updates live |
| Pickers | Native per platform: `@expo/ui/jetpack-compose` `DatePickerDialog`/`TimePickerDialog` on Android; DOM `<input type="date"/"time">` on web |
| Multi-day | Yes — add end-date field (timed events may span days; all-day inclusive UI, exclusive DTEND in ICS) |
| Recurrence | Presets None/Daily/Weekdays/Weekly/Monthly/Yearly + end condition (forever / until date / after N times). Foreign complex rules → read-only "Custom", never rewritten |
| Alarm | One DISPLAY VALARM. Timed presets: at time / 5m / 10m / 30m / 1h / 1d before. All-day: morning-of 9:00 (`TRIGGER:PT9H`) / day-before 9:00 (`-PT15H`) |
| Alarm firing | **App fires them**: Android via expo-notifications (exact alarms), web best-effort (tab-open timer + `new Notification()`) |
| Foreign alarm offsets | Show "Custom · 45m before" and **allow** overwrite to a preset (mutate trigger in place) |
| Notification tap | **Deep-link to the occurrence's day** (calendar centers on it) |
| Permission denied | Subtle hint line under the alarm row; VALARM saves regardless |
| Location | Photon direct (`photon.komoot.io`), silent degrade to plain text; store only the chosen label text in LOCATION (no GEO) |
| Sheet | `@gorhom/bottom-sheet@5.2.14` (exact pin), width-based: sheet < 768px (`useIsWide`), centered RN Modal on wide |
| Adopted from planning | RECURRENCE-ID overrides also count as "Custom" (never rewrite series rule over per-occurrence overrides); Delete button reads "Delete series" for recurring events |

## Research summary (load-bearing facts; all verified 2026-07-19)

**@gorhom/bottom-sheet 5.2.14** — peers satisfied by installed reanimated 4.3.1 / RNGH 2.31.1; pure JS (no prebuild); React 19 floor is 5.2.9; web works under RNW 0.21. Setup: `BottomSheetModalProvider` in `_layout.tsx` inside existing `GestureHandlerRootView`; `BottomSheetModal` + `BottomSheetScrollView` + `BottomSheetTextInput`; `enableDynamicSizing` + `maxDynamicContentSize`; `BottomSheetBackdrop` (`appearsOnIndex 0`, `disappearsOnIndex -1`, `pressBehavior "close"`) + `enablePanDownToClose`; `android_keyboardInputMode="adjustResize"` (manifest is adjustResize), `keyboardBlurBehavior="restore"`; Android back button is DIY (`BackHandler` hook while presented; predictive back is off in app.json). Do NOT nest inside RN Modal. Don't bump reanimated (4.4.0 has a sheet-invisible bug, #2690). Install: `bun add --exact @gorhom/bottom-sheet@5.2.14`.

**@expo/ui pickers (56.0.17, already installed + autolinked)** — import `Host`, `DatePickerDialog`, `TimePickerDialog` from `@expo/ui/jetpack-compose`. Dialogs open on mount, close on unmount (`onDateSelected` / required `onDismissRequest`); host can be zero-sized (dialog lives in its own window). `is24Hour` defaults true. **UTC trap**: date component uses UTC-day millis — pass `initialDate` as `` `${day}T00:00:00Z` `` and read back `d.toISOString().slice(0,10)`; time component uses local `Date` (existing `toTimeString` fine). Inline variant fires `onDateSelected` once on mount — avoid inline, use dialogs. Risk gate: smoke-test a Compose dialog launched from inside RN `Modal` first; fallback = `@react-native-community/datetimepicker` imperative `DateTimePickerAndroid.open()`.

**Web inputs** — direct JSX `<input type="date"/"time">` in `.web.tsx` files (RNW renders DOM; no interop shim; don't nest in `<Text>`; inline `style` object, not RNW StyleSheet). `time` value is always 24h `"HH:MM"`; `date` always `"YYYY-MM-DD"` — match `toDateString`/`toTimeString` exactly. Set CSS `colorScheme` per theme so the browser popup follows dark mode; hide `::-webkit-calendar-picker-indicator` via one injected `<style>` tag; `showPicker()` (Baseline 2022) on click in try/catch (needs user activation). Value can be `""` mid-edit — validate before commit.

**ical.js 2.2.1 (installed)** — RRULE: `ICAL.Recur.fromData({ freq: 'DAILY'|'WEEKLY'|'MONTHLY'|'YEARLY', byday: ['MO','TU','WE','TH','FR'], count?, until? })` (lowercase keys, UPPERCASE freq, byday plain strings); attach `vevent.updatePropertyWithValue('rrule', recur)` → serializes `RRULE:FREQ=...` correctly; remove `vevent.removeProperty('rrule')`; read `getFirstPropertyValue('rrule')` → decorated `ICAL.Recur` (`freq` uppercase, `interval` defaulted 1, `parts.BYDAY` keeps ordinals as strings). UNTIL must match DTSTART value type: all-day → `ICAL.Time` `isDate` (`UNTIL=YYYYMMDD`); timed → **local end-of-day → UTC** `ICAL.Time.fromJSDate(new Date(y,m,d,23,59,59), true)` (`UNTIL=...T...Z`); UNTIL is inclusive. VALARM: `new ICAL.Component('valarm')` + `action: 'DISPLAY'` + `description` + `trigger: ICAL.Duration.fromSeconds(-min*60)` → `TRIGGER:-PT10M`; RELATED defaults to START; replace by mutating our alarm's trigger in place; remove **instance-based** `removeSubcomponent(instance)` (string form kills the first VALARM indiscriminately). "Ours" = first VALARM with ACTION DISPLAY **and** `trigger instanceof ICAL.Duration`. Untouched foreign rules round-trip byte-identically; only deliberately rewritten rules normalize. ical-expander bundles a private ical.js 1.5.0 for expansion — behavior verified consistent for presets.

**RRULE risks** — (1) **BYDAY evaluates in DTSTART's own zone**; app-written DTSTARTs are UTC, so in UTC+8 an event before 08:00 local sits on the previous UTC day: rotate the weekdays BYDAY set by `(storedWeekday − localWeekday)` computed from the parsed DTSTART (`ICAL.Time.dayOfWeek()` vs `.toJSDate().getDay()` — handles UTC, TZID, and DATE starts uniformly). Helper + unit tests (deltas −1/0/+1). (2) Weekdays preset on a weekend-dated event: first occurrence silently jumps to Monday; the DTSTART occurrence never renders — allowed, documented. (3) `maxIterations: 1000` in `expandEvents` truncates forever-daily series after ~2.7y — acceptable, note in code.

**expo-notifications (SDK 56 → 56.0.21)** — `bunx expo install expo-notifications`. Local-only use needs **no FCM/google-services**. app.json: plugin entry `["expo-notifications", { icon, color }]` (white-on-transparent 96×96 PNG) + `android.permissions: ["android.permission.USE_EXACT_ALARM", "android.permission.SCHEDULE_EXACT_ALARM"]` — USE_EXACT_ALARM (API 33+) is install-granted for calendar apps, makes `canScheduleExactAlarms()` true → lib takes its `setExactAndAllowWhileIdle` branch; SCHEDULE_EXACT_ALARM covers API 31–32 (auto-granted there). No runtime exact-alarm prompt needed. Android 13+ `POST_NOTIFICATIONS` runtime request via `requestPermissionsAsync()` — ask when the user first sets an alarm. Channel `event-alarms` (HIGH) at startup + `setNotificationHandler` with `shouldShowBanner/shouldShowList/shouldPlaySound` (else foreground alarms are invisible). Trigger: `{ type: SchedulableTriggerInputTypes.DATE, date, channelId }`; custom `identifier` supported and replaces on re-schedule; `getAllScheduledNotificationsAsync`/`cancelScheduledNotificationAsync` exist. No RRULE triggers — schedule concrete expanded occurrences. Reboot replay is built in (BOOT_COMPLETED). Android caps ~500 alarms/app — horizon keeps us <100; try/catch schedule. ColorOS force-stop wipes alarms; store may lie afterwards → **idempotent full re-reconcile on every app open/foreground**, don't trust the scheduled list alone. Tap → `addNotificationResponseReceivedListener` + `getLastNotificationResponseAsync` (cold start) carry `data.day`. Web: expo-notifications has **no web support** — hand-rolled `.web.ts`: ~30s `setInterval` while tab open + `new Notification()` (permission from a user gesture; `notification.onclick` → `window.focus()` + set day param); silent no-op if denied/unsupported.

**Photon** — `GET https://photon.komoot.io/api/?q=<q>&limit=5&lang=en`. CORS verified: `Access-Control-Allow-Origin: *` (and preflight OK); keep the fetch header-free so no preflight fires. Autocomplete is an advertised core feature; fair-use, no key, no SLA. Pin `lang=en` (invalid lang = HTTP 400; unpinned = localized country names). Client rules: debounce 250–300ms, min 3 chars, `AbortController` per keystroke + ~4s timeout-abort, in-memory Map cache (cap ~50), circuit breaker after ~3 consecutive failures (session), any non-200/parse error = silent degrade. Label: `[name, street+housenumber (skip if === name), city (skip if === name), state (only if countrycode US), country (skip if === name)]` → case-insensitive dedup → join ", ". Attribution line "Search by Photon · data © OpenStreetMap contributors" under the suggestions. Server sends `Cache-Control: max-age=3600` (browser cache helps web for free).

## Approach

One shared form, two shells. `EventEditor` keeps its public contract (`event`, `defaultDay`, `onClose`, `onDone: EditorResult`) so `month-screen.tsx` barely changes. Inside: `useIsWide()` → wide renders the existing centered `Modal` shell; narrow renders a `BottomSheetModal` shell. Both host a new `EventEditorForm` (all fields/state/validation/diff-save/delete; takes a `TextInputComponent` prop so the sheet passes `BottomSheetTextInput`). Date/time fields are platform-split components with a string-in/string-out contract (`'YYYY-MM-DD'`/`'HH:MM'`), so the form never touches platform APIs. ICS gains `rrule.ts` + `valarm.ts` writers wired into `buildEventICS`/`editPreserving`; `EventInput`/`EventChanges` gain `recurrence?: RecurrenceInput | null` and `alarm?: AlarmInput | null` (null = remove, undefined = untouched) preserving diff-save semantics. Alarm firing is a standalone `src/alarms/` pipeline (pure occurrence-derivation + pure reconcile diff + platform scheduler splits) triggered from app lifecycle, not from month fetches.

### Design priorities (in order)
1. Don't break lossless round-trips (byte-identical DTSTART/RRULE/VALARM on unrelated edits)
2. Identical behavior web/Android where it's cheap; native feel where it isn't
3. Minimal new dependencies (2: bottom-sheet, expo-notifications)
4. Pure, unit-testable logic modules; thin components
5. Theme tokens only (Spacing, 4px radius, Fonts, Brand/Accent/Danger)

## Implementation phases

### Phase A — Deps + risk-gate smoke test (needs Android dev build)
- [ ] Copy this plan to `.claude/plans/event-editor-refresh-plan.md` (repo convention) and keep it current
- [ ] `cd app && bun add --exact @gorhom/bottom-sheet@5.2.14`
- [ ] Temporary smoke section in the styleguide screen: Compose `DatePickerDialog`/`TimePickerDialog` in `<Host>` mounted from inside an RN `Modal`; a `BottomSheetModal` with `BottomSheetTextInput` + the same picker inside
- [ ] Verify on `bun run android:dev` (plain, never `--bun`): dialogs stack above Modal and sheet; UTC-day round-trip correct; 24h time; sheet gestures/keyboard OK. Verify sheet renders on web (`bun run web:proxy`, localhost:8880)
- [ ] **Gate**: Compose-in-Modal broken → `bunx expo install @react-native-community/datetimepicker`, switch Android field internals to `DateTimePickerAndroid.open()` (field contract unchanged)
- Files: `package.json`, styleguide screen (temp)

### Phase B — CalDAV layer (pure; web/bun iteration)
- [ ] `caldav/types.ts`: `RecurrencePreset`, `RecurrenceInput { preset, until?, count? }`, `AlarmInput { offsetMinutes }` (positive = before start); extend `EventInput`/`EventChanges`
- [ ] New `caldav/rrule.ts`: `applyRecurrence(vevent, rec | null, allDay)` (Recur.fromData; weekdays BYDAY rotation helper; UNTIL per value type), `readRecurrence(ics) → RecurrenceInput | 'custom' | null` (custom when: interval>1, non-weekday BY-parts, ordinal BYDAY, multiple RRULEs, EXRULE/RDATE, non-preset freq, **or sibling VEVENT with RECURRENCE-ID**)
- [ ] New `caldav/valarm.ts`: find-ours, `applyAlarm(vevent, alarm | null)` (mutate trigger in place when ours exists; instance-based remove), `readAlarm(ics) → AlarmInput | 'absolute' | null` (Duration triggers always map to `offsetMinutes` — non-preset offsets are editable per decision; `ICAL.Time` triggers / RELATED=END → 'absolute' read-only), `alarmTimeFor(raw, occStart) → Date | null` for the scheduler
- [ ] Wire both into `buildEventICS` + `editPreserving` (order: start/end applied before recurrence so rotation sees the new DTSTART; recurrence-only edits read DTSTART from the tree)
- [ ] Tests (`bun test`): every preset's serialization incl. COUNT/UNTIL both flavors; rotation deltas −1/0/+1 across UTC/TZID/DATE starts; custom-detection matrix; alarm add/replace(foreign props survive)/remove; all-day PT9H/−PT15H; **title-only edit leaves RRULE+VALARM byte-identical**; existing ics.test.ts untouched and green
- Files: `caldav/types.ts`, `caldav/ics.ts`, new `caldav/rrule.ts` + `caldav/valarm.ts` + tests, `caldav/__tests__/ics.test.ts`

### Phase C — Shells + date-as-title header + e2e stabilization
- [ ] Extract `EventEditorForm` (components/calendar/event-editor-form.tsx); `event-editor.tsx` becomes the shell chooser (wide = existing Modal, visually unchanged)
- [ ] New `event-editor-sheet.tsx`: BottomSheetModal per research settings above + BackHandler dismiss hook; `BottomSheetModalProvider` into `_layout.tsx`
- [ ] Header: move `dayLabel()` from day-popover.tsx to `utils/date.ts`; title = `dayLabel(startDay)` in `BrandColor`, live; day-popover imports the shared helper
- [ ] `testID`s on the editor container + every field; e2e spec: replace `'New event'`/`'Edit event'` text assertions and positional `getByRole('textbox').nth(n)` with testIDs
- [ ] Verify: web wide (unchanged) + web narrow (sheet) + Android sheet (keyboard, pan-down-close, back button); `tooling/e2e/run.sh` green
- Files: `event-editor.tsx`, new `event-editor-form.tsx` + `event-editor-sheet.tsx`, `_layout.tsx`, `utils/date.ts`, `day-popover.tsx`, `tooling/e2e/month-grid.spec.ts`

### Phase D — Picker fields + multi-day end date
- [ ] New `components/fields/date-field.tsx`/`.web.tsx` + `time-field.tsx`/`.web.tsx` (contract: `value`, `onChange(next)`, `label?`, `min?`/`max?` for dates, `testID`). Android: pressable styled like inputs → mounts dialog in zero-footprint `<Host>`; web: styled DOM input (theme tokens + `colorScheme` CSS + hidden webkit indicator + `showPicker()` on click)
- [ ] Form: `startDay`/`endDay`/`startTime`/`endTime`; end-date field (all-day: inclusive UI ↔ exclusive DTEND — prefill subtracts a day from `event.end`); validation end ≥ start across day+time; timed events may span days (`resolveTimes` uses `endDay`)
- [ ] e2e: dates via `fill()` on `input[type=date]` by testID
- [ ] Verify: Android pickers in both shells; web inputs light+dark; multi-day banner renders after save; unit tests for extended resolveTimes/prefill (pure `initialFormState`)
- Files: new `components/fields/*` (4), `event-editor-form.tsx`, `utils/date.ts` (if helpers needed), e2e spec

### Phase E — Recurrence UI
- [ ] New `components/calendar/recurrence-field.tsx`: preset row (chip/row options — None/Daily/Weekdays/Weekly/Monthly/Yearly) + end condition (Forever / Until [date-field] / After [N] times) shown when preset ≠ None; `custom` state renders read-only "Custom repeat" and never emits changes
- [ ] Prefill via `readRecurrence(event.raw)`; diff-save emits `changes.recurrence` only when state differs from prefill (`null` for preset→None)
- [ ] Delete button label "Delete series" when `event.recurring`
- [ ] Verify: create weekly + weekdays + until + count events on web → chips land on the right days; edit round-trips every preset; foreign complex rule shows Custom and title-edit leaves it untouched (bytes)
- Files: new `recurrence-field.tsx`, `event-editor-form.tsx`

### Phase F — Alarm UI (ICS only)
- [ ] New `components/calendar/alarm-field.tsx`: timed presets None/At time/5m/10m/30m/1h/1d; all-day presets None/Morning of (9:00)/Day before (9:00); foreign Duration offsets show "Custom · Nm before" and may be overwritten; absolute-trigger alarms read-only; all-day toggle remaps/clears incompatible selection; hint line slot (Phase G fills it)
- [ ] Verify: saved ICS TRIGGER correct via dev proxy/Radicale; bell flag (`CalEvent.alarm`) appears; widget bell shows
- Files: new `alarm-field.tsx`, `event-editor-form.tsx`

### Phase G — Alarm firing + deep-link (needs dev-client rebuild)
- [ ] `bunx expo install expo-notifications`; app.json: plugin entry (new `assets/images/notification-icon.png`, white 96×96, from the app mark; color = AccentColor) + `android.permissions` USE_EXACT_ALARM + SCHEDULE_EXACT_ALARM; rebuild dev client (`bun run android:dev`)
- [ ] New `src/alarms/`: `occurrences.ts` (pure: CalEvents + horizon(14d) → `{ id: alarm:{uid}:{occStartEpoch}, fireDate, title, body, day }`, skips past/absolute), `reconcile.ts` (pure diff desired vs scheduled → toCancel/toSchedule; idempotent), `scheduler.ts` (expo-notifications: channel, handler, permission ensure, DATE triggers with `data.day`, list/cancel), `scheduler.web.ts` (interval + `new Notification()`, onclick focus+day param), `runner.ts` (coalesced `runAlarmReconcile()`: `fetchMonth(now, now+14d)`, fallback to snapshot buckets intersecting horizon, diff, apply)
- [ ] Export snapshot cacheKey helper from use-month-events (or move to month-events-store) for the cold-start fallback
- [ ] New `hooks/use-alarm-reconcile.ts` mounted in `_layout.tsx` (mount + AppState→active, ~5s debounce); `month-screen.tsx` calls `runAlarmReconcile()` in `onEditorDone` + delete-undo (next to `refreshAgendaWidget()`)
- [ ] POST_NOTIFICATIONS asked when the user first sets an alarm (from the alarm field); denied/unsupported → hint line "Notifications are off — reminders won't ring here"; web permission from the save gesture
- [ ] Tap deep-link: notification `data.day` → response listener (+ `getLastNotificationResponseAsync` cold start) routes to `?day=YYYY-MM-DD`; month-screen consumes `?day=` (same pattern as the widget's `?new=` nonce) and centers the grid on that day; web `notification.onclick` sets the same param
- [ ] Verify: unit tests for occurrences/reconcile; manual Android checklist below
- Files: new `src/alarms/*` (5 + tests), `hooks/use-alarm-reconcile.ts`, `_layout.tsx`, `month-screen.tsx`, `use-month-events.ts`, `app.json`, new icon asset

### Phase H — Location autocomplete
- [ ] New `src/location/photon.ts` (fetch+abort+timeout+cache+breaker), `src/location/label.ts` (pure composition per research rule) + tests, `hooks/use-location-search.ts` (debounce 250ms, min 3 chars)
- [ ] New `components/calendar/location-field.tsx`: input + suggestion list beneath (both shells; suggestions inline in the form flow, tap fills text) + attribution line
- [ ] Verify: label unit tests; web + Android manual (suggest, pick, airplane-mode degrade, breaker)
- Files: new `src/location/*` + hook + `location-field.tsx`, `event-editor-form.tsx`

### Phase I — Polish + full verification sweep
- [ ] Remove styleguide smoke section (or promote deliberately); final visual pass (spacing rhythm, dark mode, focus order, disabled states)
- [ ] e2e: narrow-viewport sheet step; recurrence step (daily × 3 → 3 chips)
- [ ] `bun run typecheck && bun run lint && bun run format:check`; `bun test` all suites; `tooling/e2e/run.sh`
- [ ] Full manual Android checklist; update `docs/Requirements.md` decisions log (recurrence/alarm/location decisions) if desired
- [ ] Plan file → Status COMPLETE + summary + deviations

## Edge cases & validation

1. Timed end ≤ start across `endDay+endTime` vs `startDay+startTime` → inline error (day-spanning now legal); all-day `endDay < startDay` → error
2. All-day DTEND exclusivity: UI inclusive; ICS +1d; prefill −1d
3. Weekdays preset on weekend-dated start: allowed; first occurrence is Monday (documented, cosmetic)
4. UNTIL day < start day → error; UNTIL inclusive semantics (local end-of-day → UTC for timed)
5. BYDAY rotation for early-morning local times (UTC+8) and for foreign TZID starts
6. Web input `""` mid-edit: blocked at save; header keeps last-valid day label
7. Complex/foreign rules and absolute-trigger alarms: read-only, never rewritten; RECURRENCE-ID overrides force Custom
8. Recurring edits/deletes are whole-series (existing semantics; delete = "Delete series", undo re-PUTs)
9. All-day toggle remaps/clears incompatible alarm preset
10. Permission denied / web unsupported: VALARM still saves; hint line; scheduling no-ops
11. Photon down/timeout/breaker: plain text field, zero error UI
12. Reconcile: skips past fire-times and absolute triggers; >14d occurrences picked up by later reconciles; coalesced concurrent runs; 412 conflict paths unchanged

## Test plan

- **Unit (bun test <files>; NOT jest locally)**: `rrule.test.ts`, `valarm.test.ts`, extended `ics.test.ts` (byte-identical regressions old + new), `label.test.ts`, `alarms/occurrences.test.ts`, `alarms/reconcile.test.ts`, `initialFormState` prefill tests
- **e2e (dockerized, `tooling/e2e/run.sh`, Metro running)**: testID-based selectors; date-title assertion; date/time input fills; sheet at narrow viewport; recurrence chips
- **Manual Android (dev variant on phone)**: pickers in both shells; back button; keyboard adjustResize; multi-day + all-day; alarm 2min out fires screen-off; recurring schedules only ≤14d; delete/undo reconciles; reboot persists; force-stop + reopen reschedules; POST_NOTIFICATIONS deny → no crash + hint; notification tap lands on the right day; widget still refreshes after save

## Verification (end-to-end definition of done)

Web (localhost:8880): create a timed multi-day weekly event with a 10m alarm and a Photon-picked location entirely via pickers; header shows the date in BrandColor; chips/banners land correctly; edit title-only → Radicale object diff shows only SUMMARY/SEQUENCE/LAST-MODIFIED changed. Android: same flow in the bottom sheet; alarm fires exactly with screen off; tapping the notification opens the app centered on the day. All checks + suites + e2e green.

## Risks & open items

- Compose-dialog-inside-RN-Modal is the one unproven mechanism → gated first in Phase A with a pre-decided fallback
- ColorOS may still eat alarms despite exact-alarm perms; reconcile-on-open is the safety net; one-time phone settings (battery unrestricted, auto-startup) documented in the manual checklist
- Photon is best-effort third-party (first in the app): silent degrade + breaker; self-hosted Photon behind Caddy is the future hardening path
- @expo/ui rides an alpha Material3; pinned `~56.0.17`; re-verify on SDK bumps
- Editing a later occurrence's time still rewrites series DTSTART (pre-existing whole-series semantics, now more visible) — acknowledged, unchanged

## Build log (2026-07-19)

All phases A–H implemented and unit/e2e-verified in one session. Phase A gates
all PASSED on-device (Pixel 9 Pro XL emulator): Compose DatePickerDialog /
TimePickerDialog stack above both the RN Modal and the @gorhom sheet; UTC-day
round-trip exact; 24h time; sheet works under RNW 0.21 (e2e) and on Android
(new arch + reanimated 4.3.1). No datetimepicker fallback needed.

**Deviations**
- Web sheet: `BottomSheetTextInput` crashes under react-native-web (calls
  native `TextInput.State` APIs on blur) → sheet shell uses plain `TextInput`
  on web (`Platform.OS` select in event-editor-sheet.tsx). Browser manages its
  own keyboard, so nothing is lost.
- New `crypto.randomUUID` polyfill in src/polyfills.ts — discovered by the new
  e2e create-save step: browsers only expose randomUUID in secure contexts,
  so event creation was impossible behind a plain-HTTP proxy (e2e, bare
  tailnet). RFC 4122 v4 via getRandomValues.
- Notification icon reuses assets/images/android-icon-monochrome.png (1024²
  alpha mask) instead of a new 96×96 asset — the plugin generates densities.
- readAlarm returns 'foreign' only for absolute-time / RELATED=END triggers;
  any duration DISPLAY alarm (e.g. -PT45M from Apple) is editable and shows
  as "45m before" (user decision).
- Pure prefill/equality logic extracted to editor-state.ts (house test
  pattern); tested in editor-state.test.ts.
- e2e default viewport was already narrow (480×900) → the whole suite
  exercises the sheet; added a wide-viewport step asserting the dialog, plus
  a full recurring-create → 3 chips → Delete series step.
- month-screen already had a reactive `?day=` deep link — the notification
  tap reuses it verbatim (router.navigate from use-alarm-reconcile).

**Test state**: 205 unit tests green (`bun test src/`); e2e suite green
(including recurring create/delete against throwaway Radicale); typecheck,
lint, format all clean.

## Verification results (2026-07-21, emulator Pixel 9 Pro XL + web)

- Checks: typecheck / lint / format:check clean; **205 unit tests** green;
  **e2e suite green** (sheet + dialog shells, native date inputs, recurring
  daily×3 → 3 chips → Delete series, deep links) against throwaway Radicale.
- On-device (dev client, real tailnet Radicale): sheet editor end-to-end —
  date-as-title updates live, Compose date/time dialogs above the sheet,
  duration-preserving end shift, chip selection, save → "Event added".
- POST_NOTIFICATIONS prompt fired on first alarm selection; granted.
- **Exact alarm delivery proven**: AlarmManager registered RTC_WAKEUP
  `window=0 exactAllowReason=policy_permission`; notification posted
  **41 ms** after the scheduled second with the screen off, on channel
  `event-alarms`, HIGH importance, accent color, `alarm:{uid}:{epoch}` tag.
  Reconcile also picked up REAL upcoming VALARM events (14-day horizon).
- Notification tap fronted the app on the calendar (`?day=` deep link).
- Test event created and deleted; real calendar left unchanged.
- Not yet exercised on hardware: ColorOS battery-killer behavior on the
  user's phone (documented mitigations in plan §Risks) and Photon
  autocomplete on-device (unit + web verified).
