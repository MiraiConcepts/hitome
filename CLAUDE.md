# hitome

Personal, single-user, local-first calendar app. Expo SDK 56 / RN 0.85 (+ RN
Web) client against self-hosted Radicale over CalDAV, with an Android home-screen
agenda widget and exact alarms. Targets web + Android (Obtainium) — no iOS.

Split out of a sibling notes app, which keeps the notes canvas and its
Hocuspocus/blob backend. The two share a design language via
`MiraiConcepts/tokens`; the primitives in `src/constants/theme.ts` and
`src/components/` are currently a **verbatim copy** of that app's — keep them
byte-identical until both move onto `MiraiConcepts/components` (currently
diverged on corner radius — see Invariants — and on three theme colours
hitome added: `placeholder`, and `rule`/`ruleStrong` for the settings card).

## Layout

- `app/` — the Expo client (all product code; has its own CLAUDE.md), and
  `app/server/`: hitome's small web server (Bun, no dependencies) that serves
  the exported app, runs the login and passes `/dav/` to `CALDAV_URL` with
  the session's login. Ships in the same image (`app/Dockerfile`).
- `docs/` — `Deploy.md` (web image, login, front door), `Release.md`
  (Android APK pipeline).
- `tooling/` — `e2e/` (dockerized Playwright + throwaway Radicale + the
  server), `android-builder/` (local sign + release scripts),
  `dev-phone/`.
- `.claude/plans/` — implementation plans and build logs (historical record).

## Dev loop (bun for scripts/checks; Metro and Gradle run under node)

Bun runs checks, tests, and package installs. Metro and the Android build both
need real node: `--bun` shims node→bun, and bun can't load fsevents (Metro's
macOS file watcher — edits silently never reach the bundle) or run the Gradle
helper scripts.

- Always `cd app/` first, then plain `bun run web:proxy` — NOT `--bun`
  (breaks file watching → stale bundles). `web:proxy` is plain `web` on :8082,
  which is the port the dev server and the e2e stack expect; the web build
  talks to `/api/` and `/dav/` on whatever origin it was loaded from, so
  browsing Metro directly reaches no login and no Radicale.
- Then `bun run server:dev` (also from `app/`): hitome's server on
  `http://localhost:4000`, the app passed through from Metro (hot reload
  included). Browse that and log in with your Radicale account. It reads
  `CALDAV_URL` from `app/.env.local` (gitignored) and keeps sessions in
  `app/.hitome-dev/` (gitignored). Server unit tests: `bun run test:server`.
- Web e2e: `tooling/e2e/run.sh` — dockerized Playwright + a throwaway Radicale
  (account `test` / `test`) behind the same server on :8881 (never touches
  the real calendar). Needs Metro running (`web:proxy`). Docker runtime is
  colima.
- Android hot reload: plain `bun run android:dev` — do NOT add `--bun`. The
  Gradle steps shell out to `node` (expo autolinking, entry resolution), and
  `--bun` breaks the build in ~3s at `settings.gradle`.
  (debug build under `com.miraiconcepts.hitome.dev`, coexists with the release
  app; needs the local Android SDK.)
- Phone dev build without adb (anywhere on Tailscale): it is a plain RN
  debug build (no expo-dev-client), so it loads from its saved bundle
  location, default `localhost:8081` (= adb reverse). Point it at the Mac
  once with `tooling/dev-phone/point-at-mac.sh` (needs adb that once; again
  after a reinstall) or on the phone via Dev menu → Change Bundle Location
  → `<mac tailscale ip>:8081`; run Metro with `bun run start:tailscale`. The
  Mac firewall must allow incoming for node (it does as of 2026-10-05).
- Checks from `app/`: `bun run typecheck` (app and server), `bun run lint`,
  `bun run format:check`.
- Tests: local jest is broken under bun's runtime — run `bun test <files>`
  instead; CI runs jest via `bun run test`.
- Install Expo packages with `bunx expo install` (SDK 56 line), never
  `bun add expo-*@latest` (SDK 57 is out).

## Deploy & release

- Releases are SYMMETRIC: pushes to `main` only run CI checks; a `v*` tag
  builds BOTH the web image (→ Watchtower) and the signed APK from the same
  commit — web and Android versions always match (see the in-app badge).
- Cut: bump `expo.version` + `android.versionCode` in `app/app.json` → push →
  `git tag vX.Y.Z && git push origin main vX.Y.Z`. The tag signs and publishes
  the Release itself (keystore in the `KEYSTORE_BASE64` repo secret, reversed
  2026-09-03); Obtainium + Watchtower deliver. `sign-release.sh` remains the
  fallback when the signing step fails. See `docs/Release.md`, `docs/Deploy.md`.

## Invariants

- **No CalDAV credentials in the repo, CI, images or bundles** — ever. Nothing
  is baked: not the password, and (since v0.4) not the server URL either.
  - **Web** (since v0.7): people log in on the page. hitome's server
    (`app/server/`) checks the login with `CALDAV_URL`, keeps it encrypted in
    its data volume, and gives the browser an httpOnly, SameSite=Strict
    session cookie; `/dav/` requests go upstream with the session's login.
    The browser never holds the password or a readable token, and a 401 is
    never passed on with `WWW-Authenticate` (it would raise the browser's own
    password box). The image's only setting is `CALDAV_URL`, an address.
  - **Android** holds no login at all (since v0.5): it reads and writes the
    phone's calendar store (`src/store/`, native bridge in
    `app/modules/calendar-store`), which DAVx⁵ or another sync app keeps in
    step with the server — DAVx⁵ holds the login, and offline edits wait in
    the store for it. `src/config/dav-storage.ts` is a stub that holds
    nothing (the keystore login and its erase-at-launch are gone since
    v0.7.2). Screens import events from
    `src/data/events` (CalDAV on web, the store on Android).
  - Never reintroduce credential baking, and never store a credential anywhere
    a browser can read it.
- UI is square: no corner radius on cards, buttons, fields, chips, sheets or
  the widget (changed from 4px on 2026-10-04). A calendar is marked by an
  icon in its colour (`CalendarMark`: gift for birthdays, else a calendar),
  not a dot. Only the month grid's tap ripple stays round. This breaks
  byte-identity with the notes app's `theme.ts`/`src/components/` until it
  makes the same change.
- Ports on this Mac: 4000 is this repo's dev server (`server:dev`) and 4100
  is mitsume's dev proxy (fixed so both apps run side by side), 8881 is this
  repo's e2e stack, 8080 belongs to an unrelated dev server, and 5000 is
  macOS AirPlay.
