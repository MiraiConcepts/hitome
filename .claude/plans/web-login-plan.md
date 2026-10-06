# Web login and self-hosting: plan

Status: built 2026-10-06 (uncommitted, for review). Ships as v0.7.0: v0.6.0 went out first with the web UI first pass.

## Goal

Anyone can run their own copy of hitome's web app, then open the page and
log in, the way they install the Android app and point it at their server.
No login is typed into a settings file; the only setting is the calendar
server's address.

## Decisions (asked 2026-10-06)

| Question | Answer |
|---|---|
| Who uses it | Anyone who runs their own copy |
| People per copy | One |
| Reachable from | Deployer's choice: private network or internet |
| First run | Open the page and log in; no login in any file |
| Login on a private network too | Yes, always (simplest; one behaviour) |
| Deployer skill | Knows basic Docker (Immich-level) |
| Calendar servers | Radicale first; other CalDAV servers later |
| Server address | Set once by the deployer in the compose file (`CALDAV_URL`, an address, not a password); the login screen asks only username and password. Changed from "typed on the login screen" after comparing with Immich, which never connects to a typed address. |
| Stay logged in | Until they log out |
| Sessions after a restart | Kept (small encrypted file in hitome's Docker volume), as Immich keeps them in its database |
| Kit contents | hitome only; people bring their own Radicale |
| Before building | Commit the first-pass web UI work (own files only) |

## Shape (option B from the comparison)

hitome's image becomes "app files + a small server" instead of files only.

```
browser ── hitome login screen (username, password)
   │
   ▼
hitome server ── checks the login against that CalDAV address
   │            (at CALDAV_URL, set by the deployer)
   │            keeps the login server-side, gives the browser a wristband
   │            (httpOnly cookie: page code cannot read it)
   ▼
/dav/* requests ── hitome server adds the right login ──► Radicale
```

- The browser never holds the password: the "no credentials in the
  browser" rule still holds.
- The server holds the login while a session is alive, in an encrypted
  file in its volume, so restarts and updates keep people logged in.
- Log out ends the session; "log out everywhere" ends them all.
- Android is unchanged (it uses DAVx5 and the phone's calendars).

## Pieces to build

1. Small server in the hitome image: serves the app, login and logout
   endpoints, proxies /dav/ with the session's login.
2. Login screen in the web app (username and password, with
   connectFailureMessage wording).
3. Log out (and log out everywhere) in Settings.
4. Session expiry: none (until log out), per the decision.
5. Guard against password guessing (slow down after failed attempts).
6. Self-host kit: one compose file (hitome only, CALDAV_URL pointing at
   the deployer's Radicale), notes for putting it behind an existing HTTPS
   front door (Caddy, Traefik, Nginx Proxy Manager), a short README
   section, and a warning about the internet without HTTPS.
7. Multi-architecture image (add ARM: Raspberry Pi and similar).
8. e2e: log in, log out, wrong password, server down.
9. Your own deployment: drop HITOME_DAV_B64 and the Caddy login
   injection once the login works.

## Defaults (not asked; say if wrong)

- Today's no-login mode is removed: one way to run it.
- The small server is written in TypeScript and runs on Bun, like the
  repo's tooling.
- Settings on the web shows "Logged in as <name>" and Log out. A list of
  logged-in devices can come later.
- Shipped as the next minor release (v0.7.0), web and Android together.

## Not in scope

Several people with separate calendars on one copy; Google or passkey
login; support promises for CalDAV servers other than Radicale.

## Build log (2026-10-06)

- app/server/ (Bun, no dependencies): index.ts (routes, static files with
  gzip and the old Caddyfile's cache and security headers, dev pass-through
  to Metro incl. the hot-reload websocket), sessions.ts (AES-256-GCM file,
  hashed tokens), limiter.ts (5 free failures, then 30 s doubling to 15 min),
  caldav.ts (login check, /dav/ forwarding, path guard). 12 bun tests.
- Cookie: hitome_session, HttpOnly, SameSite=Strict, Secure behind https,
  Max-Age 400 days renewed on each /api/session. Cross-site writes refused by
  Origin. A /dav/ 401 from the calendar ends every session with that login.
- App: config/session.ts; source.ts follows the session; the web setup
  screen is now the login screen (login-form.tsx replaces server-form.tsx);
  Settings → Account (logged in as, calendar server, Log out, Log out
  everywhere); a refused /dav/ request rechecks the session. SettingsButton
  now has the button role (it was announced as text).
- Image: oven/bun alpine, non-root, port 3000, /data volume, healthcheck;
  app/Caddyfile removed. CI builds amd64 + arm64 (build stage on
  BUILDPLATFORM; needs buildx locally).
- Dev: `bun run server:dev` on :4000 replaces tooling/dev-proxy (removed).
- e2e: Radicale with a test/test htpasswd account, the server in front on
  :8881, globalSetup logs in and saves storageState; new login.spec.ts. All
  3 specs pass.
- Docs: Deploy.md rewritten (compose, front door, moving from <0.7),
  CLAUDE.md, README (credentials bullet, Running it).
- Not done: applying the move on the real server (the user's step).
