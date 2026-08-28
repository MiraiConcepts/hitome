# Deploy — hitome web + Radicale (same-origin)

> First-cut deployment for the calendar web app. Android/Obtainium is a separate
> track — see `docs/Release.md`.

## Shape

One new container (`hitome`, static web app) plus one new site block on the existing
host Caddy. The app and Radicale share ONE origin — the app is served at `/` and
Radicale is proxied under `/dav/` — so the browser never makes a cross-origin CalDAV
request and **no CORS configuration is needed anywhere**.

**Credentials are server-side only.** Clients (web *and* the Android app) send no
Authorization; Caddy injects it on `/dav/*` from `HITOME_DAV_B64` in the server's
`.env`. Consequence, explicitly accepted: **tailnet reachability = calendar access**
on this origin (single-user tailnet, secured devices — Requirements §9.10 posture).
Optional hardening: a Tailscale ACL restricting which devices may reach this port.
Revisit if the tailnet ever gains other users.

```
web browser ──┐  /dav/* (no credentials)                       ┌─► radicale:5232
              ├───────────────► host Caddy ──[+ Authorization]──┤
Android app ──┘                     ▲                           └  (X-Script-Name /dav)
                      HITOME_DAV_B64 in server .env
```

CD is release-gated (symmetric with Android — see `docs/Release.md`): a `v*` tag
builds `ghcr.io/miraiconcepts/hitome:latest` (`.github/workflows/web-image.yml`) and
Watchtower redeploys it. Pushes to `main` deploy nothing.

## 1. Compose service

Add to `docker-compose.yml` (mirrors the stack's hardening conventions):

```yaml
  hitome:
    container_name: hitome
    image: ghcr.io/miraiconcepts/hitome:latest
    restart: unless-stopped
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE # in-container Caddy binds :80
    deploy:
      resources:
        limits:
          memory: 64M
    labels:
      - flame.type=application
      - flame.name=hitome
      - flame.icon=custom
      - com.centurylinklabs.watchtower.enable=true
```

And new env vars + a port mapping on the `caddy` service (`HITOME_DAV_B64` is
`base64(user:app-password)` — generate with `printf '%s:%s' 'carrein' 'app-password' | base64`
and put it in the server `.env`):

```yaml
    environment:
      HITOME_REVERSE_PROXY_PORT: ${HITOME_REVERSE_PROXY_PORT}
      HITOME_DAV_B64: ${HITOME_DAV_B64}
    ports:
      - ${HITOME_REVERSE_PROXY_PORT}:${HITOME_REVERSE_PROXY_PORT}
```

## 2. Host Caddyfile site block

```caddyfile
{$TAILNET_DOMAIN}.{$TAILNET_DNS_NAME}:{$HITOME_REVERSE_PROXY_PORT} {
	# CalDAV, same-origin: strip /dav before proxying; X-Script-Name makes
	# Radicale emit hrefs under /dav so discovery resolves through this block.
	# Server-side credential injection: replaces any client Authorization.
	# Logging hygiene: do NOT enable access logs with header capture here.
	handle_path /dav/* {
		reverse_proxy radicale:5232 {
			header_up X-Script-Name /dav
			header_up Authorization "Basic {$HITOME_DAV_B64}"
		}
	}

	handle {
		reverse_proxy hitome:80
	}
}
```

Existing clients (Etar/DAVx5, Apple Calendar) keep using the current
`:${RADICALE_REVERSE_PROXY_PORT}` block unchanged — `/dav/` is an *additional* path
to the same Radicale.

## 3. Credentials (server-side injection)

**No credentials exist in the image, the bundle, the repo, GitHub, or on any
client device.** The only baked value is `EXPO_PUBLIC_DAV_URL=/dav/` (a relative
URL that resolves against the page origin at runtime).

- The password lives in exactly one place: `HITOME_DAV_B64` in the server `.env`
  (base64 of `user:app-password`); Caddy attaches it upstream on `/dav/*`.
- Rotating the password = update Radicale + the `.env` value → restart caddy.
  No image rebuild, no client changes.
- The Android app points at this same origin (`https://<host>:<port>/dav/`) and is
  likewise credential-less; its server URL is baked at APK build time — in CI from
  the repo Actions **variable** `HITOME_DAV_URL` (a variable, not a secret; see
  `docs/Release.md`), or locally from `app/.env` (never committed).
- Dev fallback: `EXPO_PUBLIC_DAV_USER`/`_PASS` in `app/.env` make the client attach
  Basic auth itself (e.g. Android dev pointing straight at Radicale). Optional.

## 4. Verify after deploy

```sh
curl -s -o /dev/null -w '%{http_code}\n' https://<host>:<port>/            # 200 (app)
curl -s -o /dev/null -w '%{http_code}\n' https://<host>:<port>/calendar    # 200 (route)
curl -s -o /dev/null -w '%{http_code}\n' -X PROPFIND -H 'Depth: 0' \
  https://<host>:<port>/dav/                # 207 (injection working; NOT 401)
curl -s -o /dev/null -w '%{http_code}\n' -X PROPFIND -H 'Depth: 0' \
  https://<host>:{$RADICALE_REVERSE_PROXY_PORT}/   # 401 (direct Radicale still guarded)
```

A `401` on the hitome `/dav/` means `HITOME_DAV_B64` is missing/wrong in the
caddy env; a `207` on the direct Radicale port would mean injection leaked onto the
wrong site block (it must not).

Then run the smoke tests in `.claude/plans/caldav-calendar-plan.md` §Smoke tests.

## Android APK

Shipped as its own pipeline: CI builds the APK unsigned, signing + publishing happen
locally, Obtainium tracks the GitHub Releases feed. Full flow in `docs/Release.md`.

## Local web dev (same-origin without Docker)

Use `tooling/dev-proxy/Caddyfile` (see its header comment):
Metro on `:8081` + Radicale under `http://localhost:8880/dav/`, plus a local
notes backend (sync + blobs containers built from `server/`) under
`http://localhost:8880/sync` and `/blobs/`.
