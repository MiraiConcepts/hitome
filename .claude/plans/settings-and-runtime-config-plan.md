# Settings screen + runtime CalDAV config — COMPLETE
Created: 2026-09-19 · Status: COMPLETE
Revives `.claude/plans/settings-page-plan.md`, closed 2026-07-06.

## Why now

The 2026-07 plan killed the settings page when server-side credential injection
made it unnecessary, and listed what would bring it back: *"URL churn on Android
without a release pipeline, multi-user tailnet, or direct-credential mode as a
first-class feature."* Two of those arrived at once — a wish to make hitome
deployable by anyone alongside their own Radicale, and the fact that an APK with
its server URL baked in needs a release to point anywhere else.

Plus a smaller thing that turned out to be the real ask: reminders had shipped
since v0.5.0 and there was no way to tell from inside the app whether they
worked on a given phone.

## Decisions

Reached by questioning before any code (the interview is worth knowing about,
because several answers reversed earlier ones):

- **Android-first.** Web keeps riding the credentials its reverse proxy injects
  — no login screen, no password in any browser, no Caddy change. The reason is
  not laziness: a browser cannot make a cross-origin CalDAV request at all
  (PROPFIND/REPORT always preflight, Radicale sends no CORS headers), so a
  typed-in address on web is a dead end, and every web calendar UI in existence
  is server-rendered for exactly this reason. Android is where "bring your own
  server" means something.
- **The login lives in the OS keystore** (`expo-secure-store`) — where DAVx⁵ and
  Apple Calendar keep it. CalDAV is Basic auth: there is no session token to
  hold instead of the real password.
- **Save connects before it stores.** Every failure mode here is
  indistinguishable from "the calendar is empty" once you are past the screen.
- **A full-screen setup gate** on first run; nothing works unconfigured.
- **The login stays optional**, because pointing the app at the injecting proxy
  means sending none.
- Deferred: an `Advanced` address override on web. It only matters once web has
  a login at all, which "Android-first" postpones.

## What shipped

| Commit | |
|---|---|
| `5374aa1` | Settings route + notification diagnostics |
| `271620a` | Runtime CalDAV config + setup gate |
| `d8572fc` | Calendars section (default write target) |

- `src/config/` — `dav-config.ts` (pure: normalize, classify failures),
  `dav-storage.ts`/`.web.ts` (keystore vs derived), `dav-store.ts` (the live
  connection, three-state), `calendar-pref.ts`.
- `src/components/settings/` — screen, parts, server form, setup screen, and the
  four sections.
- `src/alarms/status.ts` + `sendTestNotification()` in both scheduler twins.
- Root layout is a `Stack`; `/settings` is a `transparentModal`.

## Things found along the way

- **tsdav never sends "no credentials."** Under Basic (its default, applied even
  with no `authMethod`) `getBasicAuthHeaders` stringifies whatever it is given,
  so empty credentials still sent `Basic base64("undefined:undefined")` on every
  request. Harmless only because the proxy replaced the header. `'Custom'` with
  an empty header function is the one way to actually send nothing.
- **A hidden scroll container loses its offset on web, permanently.**
  react-native-screens hides the screen below a push with `display:none`; the
  browser zeroes `scrollTop` and never restores it. A pushed settings screen
  brought the month grid back at the top of its ±5y range — five years before
  the month the header still named. Measured, then fixed by presenting settings
  over the calendar rather than instead of it. Attempts to re-anchor on focus
  instead were racy and abandoned; the note is here so nobody tries again.
- **`?day=` deep links are broken on web**, and were before any of this — the
  grid's scroll offset is restored from the previous page view, overriding
  `initialScrollIndex`. It fails `month-grid.spec.ts` at step 2, which is why
  the e2e suite is red on `main` and steps 3-13 never run. Reproduced on a clean
  checkout of `a21c201`. Not fixed here; tracked separately.

## Verified on an emulator (2026-09-19)

Against the real tailnet Radicale, on a Pixel 9 Pro XL emulator:

- Setup gate cold, with `EXPO_PUBLIC_DAV_URL` prefilling the address; Connect
  probed and saved with no login (the proxy injects), and the calendar came up
  with real events.
- Test notification posted on channel `event-alarms`, importance 4, while the
  app was on the home screen.
- Permission row moved "Not asked yet" → "Allowed" and dropped the Enable
  button; "Scheduled" read a real reconciler count.
- Calendars listed both collections with their server colours.
- **SecureStore is readable from the headless widget task** — the open risk.
  Force-stopped the app, tapped the widget's own refresh, and Last Updated
  advanced with events intact. No `expo-file-system` fallback needed.

Two bugs the emulator caught, both fixed in the commit carrying this note:
`ensureDavConfig()` returning the launch-time null forever after a save, and
"Password" wrapping in the editor's 52pt caption column.

Still unverified: a physical device, and a real reminder firing at its own
scheduled time (the test notification exercises the same channel and trigger
type).
