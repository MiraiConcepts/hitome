# Deploy — hitome web + Radicale (same-origin)

> First-cut deployment for the calendar web app. Android/Obtainium is a separate
> track — see `docs/Release.md`.

## Shape

One new container (`hitome`, static web app) plus one new site block on the existing
host Caddy. The app and Radicale share ONE origin — the app is served at `/` and
Radicale is proxied under `/dav/` — so the browser never makes a cross-origin CalDAV
request and **no CORS configuration is needed anywhere**.

**Credentials are server-side only.** The web app sends no Authorization; Caddy
injects it on `/dav/*` from `HITOME_DAV_B64` in the server's `.env`. (The Android
app never talks to this origin: it uses the phone's calendars, which DAVx⁵ syncs.) Consequence, explicitly accepted: **tailnet reachability = calendar access**
on this origin (single-user tailnet, secured devices — Requirements §9.10 posture).
Optional hardening: a Tailscale ACL restricting which devices may reach this port.
Revisit if the tailnet ever gains other users. Keep the site block addressed by
hostname (as below), never a bare `:port`: with TLS on the real name, a page
that rebinds its own DNS to this IP cannot reach the injected login.

```
              /dav/* (no credentials)                         ┌─► radicale:5232
web browser ─────────────────► host Caddy ──[+ Authorization]──┤
                                    ▲                           └  (X-Script-Name /dav)
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
			# Never pass a login challenge on: the browser would answer it
			# with its own password box. The app explains a 401 itself.
			header_down -WWW-Authenticate
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

**No credentials exist in the image, the bundle, the repo or GitHub.** The web
app is credential-less by construction: it derives `/dav/` from the page's own
origin at runtime and the proxy in front supplies the Authorization, so nothing
is stored in any browser. Nothing is baked into the web image at all now — not
even the URL.

- The password lives in exactly one place: `HITOME_DAV_B64` in the server `.env`
  (base64 of `user:app-password`); Caddy attaches it upstream on `/dav/*`.
- Rotating the password = update Radicale + the `.env` value → restart caddy.
  No image rebuild, no client changes.
- The Android app does not talk to this server itself (since v0.5): it uses
  the phone's calendars, which DAVx⁵ syncs. Add the server in DAVx⁵ with the
  Radicale address and login (straight to Radicale, not through this proxy's
  `/dav/`, which injects a login of its own). hitome holds no address or
  login, so nothing about this deploy reaches the APK.
- A deployer following this document gets the same shape: their web app needs no
  configuration, and their phone needs DAVx⁵ set up once.

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

Shipped from the same `v*` tag: CI builds, signs and publishes the APK as a GitHub
Release, and Obtainium tracks that feed. Full flow in `docs/Release.md`.

## Local web dev (same-origin)

Use the dockerized dev proxy in `tooling/dev-proxy/` (see its Caddyfile header):
Metro (`bun run web:proxy`, :8082) and your Radicale behind one origin at
`http://localhost:4000`, with the login injected from its gitignored `.env`.
