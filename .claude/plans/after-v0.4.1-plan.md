# After v0.4.1: trust, time zones, DAVx⁵ on Android, UI/UX audit

Created: 2026-10-04 · Status: PLANNED (agreed with the user, not started; all questions settled)

Audience for the next few months: the user plus a few friends, each on their
own server. Code cleanup (splitting the big files) is deliberately out.

## 1. Trust and safety

- Fix the `?day=` deep-link bug that stops `tooling/e2e/run.sh` at step 2, so
  the web suite runs end to end again — including its never-run recurring
  step (see recurring-scope-and-public-readiness-plan §1).
- CalDAV write tests against a throwaway Radicale (the e2e one): create,
  edit and delete with each scope (this / following / all), undo of each,
  move between calendars, and a 412 conflict.
- A failed save keeps the editor open with the draft and says why
  ("Not saved — no connection"), never drops what was typed.
- Hook-level tests for the editor (`use-event-editor`): the defaults past
  midnight and the All-day toggle (both broke in v0.4.1 work), the chip
  row's deferred commit.
- Small: Undo snackbar 6 s → 8–10 s.

## 2. Time zones (≈ half a day; matters mostly for web after §3)

- Timed events are written as UTC today (`toTimePair` in `caldav/ics.ts`),
  so a repeating 9:00 drifts an hour across daylight saving.
- Write them with the device's zone (TZID + an embedded VTIMEZONE — needs a
  small tz-data package; ical.js has no tz database). Reading TZID already
  works (Apple events).
- Decided: Google's behaviour — an event is pinned to the zone it was made
  in (a 9:00 Tokyo meeting shows 8:00 back in Singapore).
- Straight upgrade: existing UTC events stay correct; edits keep each
  event's existing format.

## 3. Android reads the phone's calendar store; DAVx⁵ syncs

The user already runs DAVx⁵ (`at.bitfire.davdroid`) syncing both Radicale
calendars into Android's calendar store (it fed Etar before hitome). That is
the standard Android pattern — Etar, Fossify, Google Calendar have no server
login of their own — and it brings offline edits + sync for free.

- Data layer split: one interface (month fetch, create, update, delete with
  scope, move, undo) with two sources — CalDAV (web, unchanged) and the
  calendar store via `expo-calendar` (Android).
- Android first run: "Use your phone's calendars" → Allow calendar access
  (system prompt) → straight to the month; with no calendars, a screen
  pointing to DAVx⁵ on F-Droid (or a Google account).
- Every visible calendar in the store shows (as Google Calendar / Etar do);
  the existing eye in Settings hides one.
- Settings → Server becomes "Calendars sync through DAVx⁵ · Open DAVx⁵";
  Disconnect / Sign out and erase go. The signed-out widget asks for
  calendar access instead of sign-in.
- Widget and reminders read the local store (offline, no network). Keep
  hitome's own exact alarms, now fed from the store.
- Verify on the phone: recurring this / following / all through the store
  round-trips correctly to Radicale via DAVx⁵; reminders (VALARM ↔
  Reminders table); moving between calendars (copy + delete).
- Rollout: no transition release (user's call — single user, no backwards
  compatibility needed). The direct-Radicale login on Android and its
  keystore storage (`config/dav-storage.ts`) are removed in the same
  release that adds the calendar store.
- The "no CalDAV credentials" invariant gets stronger on Android: hitome
  holds no login at all; DAVx⁵ does.

Web stays as it is: direct CalDAV through the server's `/dav/`, login only
in the server's config, online-only (as Google Calendar on the web).

## 4. Mobile UI/UX audit

- Lighthouse accessibility + best practices on the web build in mobile
  emulation (chrome-for-testing, per the user's global CLAUDE.md).
- Android: tap-target sizes and labels from `uiautomator dump` over adb;
  optionally Google's Accessibility Scanner on the phone.
- Then polish from the findings, plus the signed-out widget's empty space.

## Decided

- Refresh (↻) stays as "sync now": on Android it asks DAVx⁵ to sync
  immediately (`ContentResolver.requestSync` on the calendar authority, as
  Etar's Refresh does — a small native module, since `expo-calendar` has no
  sync trigger); on web it re-fetches from the server as today.
- Offline on web: out of scope (online-only, as Google Calendar on the
  web). A read-only cached view (service worker) would be the cheap step if
  ever wanted.
