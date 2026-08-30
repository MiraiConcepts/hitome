# Settings Page — SUPERSEDED (no settings UI)
Created: 2026-07-06 · Superseded: 2026-07-06
Status: CLOSED — decision "option C + A" made a settings page unnecessary

## What happened

v1 of this plan designed a settings page to hold CalDAV credentials per device.
The user then chose **server-side credential injection** ("option C"): the host
Caddy stamps `Authorization` onto `/dav/*` → Radicale, so **no client stores any
credential** — web and Android both ride the injected endpoint (his phone is an
authorized tailnet device). He then asked the sharp follow-up: *does a settings
page need to exist at all?* → **No ("option A")**:

- Web: zero-config — URL defaults to the page's own origin + `/dav/`.
- Android: server URL baked at APK build time from `app/.env` (a URL, not a secret;
  never committed). URL change ⇒ rebuild APK (acceptable; Obtainium pipeline later).
- Optional `EXPO_PUBLIC_DAV_USER/_PASS` env fallback keeps the direct-Radicale dev
  path alive with no UI.

## Where the record lives

- Architecture + rationale + accepted residual risk: `docs/Deploy.md` (Shape + §3),
  `docs/Requirements.md` decisions log #9, memory `caldav-auth-architecture`.
- Implementation: credential-injection work executed on `feat/caldav-calendar`
  (config/client rewrite, dev-proxy + prod-sim injection, credential-free image,
  workflow/docs strip) — see the build-log commits.

## If a settings page is ever revisited

Reasons that would revive it: URL churn on Android without a release pipeline,
multi-user tailnet (injection posture breaks), or direct-credential mode as a
first-class feature. v1's design (Memoka-patterned Server/Account/About sections,
test-then-save) remains in git history for that day.
