# CalDAV Calendar — Implementation Plan
Created: 2026-07-01
Status: SHIPPED (2026-07-06) — web live at the tailnet origin (CI → GHCR → Watchtower);
Android v0.1.0 on GitHub Releases via Obtainium (CI builds unsigned → local sign,
docs/Release.md); credentials server-side only (docs/Deploy.md). User-confirmed on
both platforms. Next: feature development (deferred list below).

## Summary (2026-07-04)

**Built on `feat/caldav-calendar`** (reversible; revert = don't merge): CalDAV data
layer (tsdav + ical.js with property-preserving edits), month-view UI with full event
CRUD + delete-undo + 412 handling on Android and web, dev same-origin proxy, web
Docker image (bun → caddy static), GHCR workflow for Watchtower CD, EAS APK profiles,
and docs/Deploy.md with the compose + host-Caddy snippets. ~36 files, +2.5k lines.

**Verified:** typecheck, strict lint, prettier, 18 unit tests (incl. the Apple
property-preservation fixture), clean Metro bundle on web, and a real
`expo export --platform web` whose dist/ structure matches the container Caddyfile.

**Live gate: PASSED (2026-07-04).** With real `app/.env` credentials, the full
round-trip ran against the production Radicale using the app's own ics layer + tsdav
(bun runtime): login/discovery → fetchCalendars (1: "carrein-calendar") → time-range
fetch + expand (12 events) → create → etag-guarded update → delete → verified gone.

**Not yet verified (needs user/device):** Hermes runtime on Android (polyfills wired,
unexercised — EAS build); in-browser UI smoke tests; Docker image build (no Docker on
this machine); the actual server deploy. See §Smoke tests.

**Key decisions during build:** see §Build log & deviations.

Companion docs: `caldav-calendar-research.md` (pinned versions + copy-paste snippets).
Supersedes the earlier interview note.

## Context

**What:** a standalone **CalDAV calendar** inside the parent app (Expo SDK 56, RN 0.85, RN Web)
that reads/writes events on the user's self-hosted **Radicale** (already used daily via
**Etar** on Android and **Apple Calendar** on macOS). The **first testable cut** is
**online-first CRUD + a month view on Android *and* Web** — small but genuinely usable.

**Why:** replace the Expo starter with the first real feature, synced to the server the user
already runs, on a **reversible branch** so it can be tested (and abandoned) safely.

**Locked decisions** (interview + this session): separate CalDAV subsystem (Radicale is the
source of truth) · month-only view · standard event fields · hard-delete + undo · no default
reminder · week starts Monday · device-local tz · **same-origin, no CORS** web · env-file creds
now (in-app settings later) · Docker web image + **Watchtower** CD · Android APK/Obtainium a
deferred track.

**First-cut scope — IN:** env creds → Radicale, month view, **list / create / edit / delete**
events, single default calendar, Android + Web.
**DEFERRED:** offline cache/SQLite · reminders · home-screen widget · recurrence *editing* ·
multi-calendar · offline queue + conflict copies · in-app settings + secure-store · timezone UI.

## Research Summary

Full detail in `caldav-calendar-research.md`. Load-bearing points:

- **tsdav@2.3.0** — CalDAV client. **RN is not an official target** → needs Hermes polyfills
  (`base-64`, `text-encoding`) imported before tsdav. **#1 risk → smoke-test first.**
- **ical.js@2.2.1** (+ `ical-expander@3.2.0`) — parse/build/serialize. **Preserve-on-edit
  pattern** (parse existing ICS, mutate only changed props via `updatePropertyWithValue`, never
  rebuild) keeps `X-APPLE-*`/`ATTENDEE`/`ORGANIZER`. **Write UTC** in the first cut (non-UTC TZID
  needs a registered VTIMEZONE); still parse incoming TZID correctly.
- **react-native-calendars@1.1314.0** — only `<Calendar>` (month) is web-safe; Agenda/List use
  RecyclerListView (web-fragile). Stay on `<Calendar>`.
- **Env:** `EXPO_PUBLIC_*` via `process.env` (Metro-inlined; embedded in bundle, not secret —
  fine here). Read with full dotted access; restart dev server after edits.
- **Web deploy:** `bunx expo export --platform web` → `dist/`; multi-stage **bun → caddy:2-alpine**
  image; **same-origin Caddyfile** = app at `/`, Radicale at `/dav/*` via `handle_path` +
  `header_up X-Script-Name /dav`.
- **EAS:** `preview` profile with `android.buildType: apk` → installable APK.
- **Two bugs to fix:** `app/.gitignore` doesn't ignore `.env` (password leak); `app.json` lacks
  `android.package` (EAS fails).
- **SDK 57 shipped** → install every `expo-*` via `expo install`, never `@latest`.

## Approach

One **reversible** feature branch, `feat/caldav-calendar`, purely **additive** (new routes + a
`caldav` module + deployment files); existing compose services and Radicale are untouched, so
reverting = don't merge / delete the branch.

Build the **data layer first and smoke-test the tsdav round-trip on both platforms before any
UI** — that embeds the de-risk spike as a hard gate. Online-first: writes go straight to Radicale
with `etag`/`If-Match` (lost-update protection); no offline queue yet. Web reaches Radicale
**same-origin** through Caddy (`/dav/*`); Android points straight at the Tailscale URL (native = no
CORS). Deployment mirrors the user's stack: `ghcr.io/<owner>/<app>` image + Watchtower + a new
hardened compose service and Caddy block.

### Design priorities (in order)
1. Minimal code / simplicity  2. Performance  3. Explicit & traceable  4. Modular  5. Readable

## Implementation Phases (first testable cut)

### Phase A — Branch, prep, bug fixes
- [ ] Cut `feat/caldav-calendar` off `main`
- [ ] Fix `app/.gitignore` (add `.env`); add committed `app/.env.example` (placeholders)
- [ ] Add `android.package: "<app package id>"` to `app.json`
- [ ] Install (via `bunx expo install` / `bun add`): `tsdav ical.js ical-expander react-native-calendars expo-crypto base-64 text-encoding`
- [ ] `src/polyfills.ts` (btoa/atob/TextEncoder guards); import it FIRST in `src/app/_layout.tsx`
- Files: `app/.gitignore`, `app/.env.example`, `app/app.json`, `app/src/polyfills.ts`, `app/src/app/_layout.tsx`, `app/package.json`

### Phase B — CalDAV data layer  (+ round-trip smoke test = de-risk gate)
- [ ] `src/config.ts` — env → `DAV = { url, user, pass }`
- [ ] `src/caldav/client.ts` — `DAVClient` Basic auth, `login()`, `fetchCalendars()` → default cal
- [ ] `src/caldav/events.ts` — `fetchMonth(range)`, `createEvent()`, `updateEvent()` (via `editPreserving`), `deleteEvent()`; UTC write; map ICS ↔ `Event`
- [ ] `src/caldav/types.ts` — `Event { url, etag, uid, summary, start, end, allDay, location, description }`
- [ ] **GATE — smoke-test before UI:** `login → fetchCalendars → fetchMonth → create → re-GET → delete` on **Android (Hermes)** + **Web**. If tsdav/Hermes fails, stop and pivot (hand-rolled `davRequest`).
- [ ] Unit test: `editPreserving` keeps `X-APPLE-*`/`ATTENDEE`/`ORGANIZER` (fixture = a real Apple event)
- Files: `app/src/config.ts`, `app/src/caldav/*.ts`, `app/src/caldav/__tests__/*`

### Phase C — Month UI + event CRUD
- [ ] Month screen: `<Calendar>` with `markedDates` from fetched events, `firstDay={1}`, orange theme
- [ ] Selected-day event list (plain `FlatList`, not Agenda) + event detail
- [ ] Event editor (create/edit): title, start/end, all-day toggle, location, notes → create/update
- [ ] Delete + Undo snackbar (hard delete)
- [ ] Add **Calendar** as a standalone tab/route (replaces the starter Explore tab)
- [ ] Loading / error / empty states; `etag` 412 → re-fetch + notify
- Files: `app/src/app/**` (calendar route + tab), `app/src/components/calendar/**`

### Phase D — Dev-time web same-origin proxy
- [ ] `tooling/dev-proxy/Caddyfile` — `:8080` → Metro `:8081` + `/dav/*` → Radicale (`X-Script-Name`)
- [ ] Doc: web dev browses `:8080` with `EXPO_PUBLIC_DAV_URL=http://localhost:8080/dav/`; Android uses the Tailscale URL
- Files: `tooling/dev-proxy/Caddyfile`, docs

### Phase E — Web Docker image + prod Caddy + compose service
- [ ] `app/Dockerfile` — multi-stage `oven/bun` build → `caddy:2-alpine` serving `dist/`
- [ ] `app/Caddyfile` — app at `/`, `/dav/*` → `radicale:5232` (`header_up X-Script-Name /dav`)
- [ ] `.github/workflows/web-image.yml` — build → push `ghcr.io/<owner>/<app>:latest` (Watchtower deploys)
- [ ] Compose snippet (docs): hardened app service + `<APP>_REVERSE_PROXY_PORT` + watchtower label + Caddy block — for the user to drop into their compose
- Files: `app/Dockerfile`, `app/Caddyfile`, `.github/workflows/web-image.yml`, docs

### Phase F — EAS Android APK config
- [ ] `app/eas.json` — `preview` → `apk`, `production` → `app-bundle`
- [ ] Doc: `bunx eas-cli build -p android --profile preview` (run when ready; build method deferred)
- Files: `app/eas.json`

## Artifacts (what you get)

- **Reversible branch** `feat/caldav-calendar` (revert = don't merge).
- A working **month calendar** that creates/edits/deletes events on Radicale, on **Android + Web**.
- Config: `.env.example`, fixed `.gitignore`, `android.package`, `eas.json`.
- Deployment: `Dockerfile` + `Caddyfile` + GitHub Actions (→ GHCR image → Watchtower) + a compose
  service snippet + a dev-proxy Caddyfile.
- Docs: this plan, the research doc, and the smoke-test checklist below.
- On demand: `ghcr.io/<owner>/<app>:latest` (CI) and a `preview` **.apk** (`eas build`).

## Smoke tests (exact — mobile + web)

Precondition: put your real Radicale `/dav` URL + app password in `app/.env`.

**WEB** (dev proxy `http://localhost:8080`, or the deployed container):
1. Month renders; existing events show as orange dots on their days.
2. **Add:** pick a day → **+** → title "Smoke test", 3–4pm → Save → dot appears; confirm it shows in Apple Calendar / Etar after sync.
3. **Edit** an Apple-created event's title → Save → sticks; re-open in Apple Calendar → location/attendees/reminders still intact (**property preservation**).
4. **Delete** → dot vanishes + Undo snackbar; confirm gone from Apple/Etar.
5. **All-day:** add "Holiday" all-day → lands on the correct single day (no time).

**ANDROID** (dev build or preview APK; `EXPO_PUBLIC_DAV_URL` = your Tailscale `https` URL):
6. Repeat 1–5 (exercises Basic-auth + Hermes polyfills; native = no CORS).
7. Kill & reopen the app → events reload from Radicale (online-first).

**CROSS-DEVICE:**
8. Add on web → appears on Android after refresh **and** in Etar/Apple → confirms Radicale is the shared source of truth.

## Build log & deviations (2026-07-04)

All phases A–F implemented on `feat/caldav-calendar` (commits `12f179f` → data layer,
`4ce6e06` → UI, `19283c8` → deployment; plus prettier style commits). Checks: typecheck,
strict lint, prettier, and 18 unit tests green (bun runner).

**Deviations from the plan:**
1. **Phase B live-gate deferred, not skipped** — the tsdav round-trip against real
   Radicale needs `app/.env` credentials the user provides directly. Unit-level risk
   (property preservation) is covered by tests; **tsdav-on-Hermes remains open until
   the Android smoke test runs.** UI was built anyway (data layer is interface-isolated).
2. **`eas.json` production profile emits an APK** (research example used app-bundle):
   this app distributes via GitHub Releases → Obtainium (Requirements §9.11), never
   the Play Store.
3. **Domain-agnostic web image** (not in original plan): `EXPO_PUBLIC_DAV_URL=/dav/`
   resolves against `window.location.origin` at runtime (guarded for static export),
   so one image works on any host.
4. **In-container Caddy serves static files only**; Radicale proxying lives on the
   HOST Caddy (one proxy layer, matches the user's compose stack) — the research
   sketch had the container do both.
5. **`restoreEvent` + `ConflictError`** added to the data layer (needed by the
   delete-undo and 412 UX from the interview decisions; not itemized in Phase B).
6. **Local jest cannot run** (no Node on this machine; jest breaks under bun's
   runtime). Tests are jest-compatible and run via `bun test` locally; CI (ubuntu,
   Node preinstalled) runs them under jest as configured.
7. One documented `react-hooks/set-state-in-effect` suppression in
   `use-month-events.ts` (online-first fetch-on-mount is the sync with the external
   system; no store to subscribe to yet).
8. Tab brand text still says "Expo Starter" (out of scope; will change when notes land).
9. **Dev proxy is dockerized** (2026-07-06, user preference — no host installs): official
   `caddy:2-alpine` via `tooling/dev-proxy/compose.yml`; Docker runtime on this Mac is
   **colima** (brew: colima/docker/docker-compose; removal documented in chat). Proxy
   listens on **:8880**, not :8080 — the user's eleventy blog dev server owns 8080.
   Verified end-to-end: Metro + `/dav/` 401 unauth / 207 authed with hrefs rewritten
   under `/dav/` by X-Script-Name.

## Edge cases & error handling
- Missing/invalid creds → clear error screen, no crash.
- Offline (online-first) → read/write surface a "needs connection" state (no queue yet).
- `etag` 412 (concurrent edit) → re-fetch + notify, retry.
- All-day non-inclusive `DTEND` handled on read and write.
- Incoming `TZID` parsed correctly; writes are UTC (first cut).
- Emoji titles render (Unicode) — matches real usage.

## Risks & open questions
- **tsdav on RN/Hermes** (unofficial) — gated by the Phase B smoke test; polyfills in place; fallback = hand-rolled `davRequest`.
- **ical.js VTIMEZONE-on-write** — UTC now; revisit for TZID round-trip.
- **Same-origin / `X-Script-Name`** — validate CalDAV hrefs resolve under `/dav/` in the web smoke test.
- **Need from you (later, non-blocking):** the tailnet host + `<APP>_REVERSE_PROXY_PORT` for Caddy/compose; the real Radicale app password in `.env`.
- **Deferred to later cuts:** offline cache/SQLite (web OPFS needs COOP/COEP) · reminders (`expo-notifications` + exact-alarm) · widget (`react-native-android-widget` SDK-56 unverified) · recurrence editing · multi-calendar · in-app settings + secure-store · offline queue/conflict copies.
