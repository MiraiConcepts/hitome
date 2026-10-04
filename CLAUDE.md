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

- `app/` — the Expo client (all product code; has its own CLAUDE.md).
- `docs/` — `Deploy.md` (web + same-origin Caddy), `Release.md` (Android APK
  pipeline).
- `tooling/` — `dev-proxy/` (dockerized same-origin Caddy for web dev),
  `e2e/` (dockerized Playwright + throwaway Radicale),
  `android-builder/` (local sign + release scripts).
- `.claude/plans/` — implementation plans and build logs (historical record).

## Dev loop (bun for scripts/checks; Metro and Gradle run under node)

Bun runs checks, tests, and package installs. Metro and the Android build both
need real node: `--bun` shims node→bun, and bun can't load fsevents (Metro's
macOS file watcher — edits silently never reach the bundle) or run the Gradle
helper scripts.

- Always `cd app/` first, then plain `bun run web:proxy` — NOT `--bun`
  (breaks file watching → stale bundles). `web:proxy` is plain `web` on :8082,
  which is the port both dockerized proxies expect; the web build always talks
  to `/dav/` on whatever origin it was loaded from, so browsing Metro directly
  reaches no Radicale.
- Browse the dockerized dev proxy at `http://localhost:8882` (injects DAV
  auth), NOT Metro's `:8082` directly (CORS). Start it from
  `tooling/dev-proxy/`: `docker compose up -d` (needs its gitignored `.env`;
  see `.env.example`). Docker runtime is colima.
- Web e2e: `tooling/e2e/run.sh` — dockerized Playwright + a throwaway Radicale
  behind its own Caddy on :8881 (never touches the real calendar). Needs Metro
  running (`web:proxy`).
- Android hot reload: plain `bun run android:dev` — do NOT add `--bun`. The
  Gradle steps shell out to `node` (expo autolinking, entry resolution), and
  `--bun` breaks the build in ~3s at `settings.gradle`.
  (debug build under `com.miraiconcepts.hitome.dev`, coexists with the release
  app; needs the local Android SDK.)
- Checks from `app/`: `bun run typecheck`, `bun run lint`, `bun run
  format:check`.
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
  - **Web** is unchanged and holds nothing: it derives `/dav/` from the page's
    own origin and the host Caddy injects Authorization (password lives only in
    the server `.env`). No browser ever stores a credential.
  - **Android** asks on first run and keeps the address + login in the OS
    keystore (`expo-secure-store`, `src/config/dav-storage.ts`) — the device,
    entered by the user, never the build. The login stays optional, because
    pointing the app at the injecting proxy means sending none.
  - Never reintroduce credential baking, and never store a credential anywhere
    a browser can read it.
- UI is square: no corner radius on cards, buttons, fields, chips, sheets or
  the widget (changed from 4px on 2026-10-04), nor on the 8pt calendar-colour
  marks (squares, not dots). Only the month grid's tap ripple stays round. This breaks
  byte-identity with the notes app's `theme.ts`/`src/components/` until it
  makes the same change.
- Ports on this Mac: 8080 and 8880 belong to unrelated dev servers, 8881 is
  this repo's e2e proxy, 8882 is this repo's dev proxy.
