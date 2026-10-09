# Deploy: hitome on the web

> Run your own copy of hitome's web app, then open it and log in with your
> calendar account. Android ships separately (see `docs/Release.md`) and needs
> none of this: it reads the phone's calendars, which DAVx⁵ syncs.

## Shape

One container, `ghcr.io/miraiconcepts/hitome`, holding the web app and
hitome's small server. It needs one setting, the address of your CalDAV
server (Radicale), and a volume for sessions. Put it behind whatever already
does HTTPS for you (Caddy, Traefik, Nginx Proxy Manager).

```
browser ──https──► your front door ──► hitome:3000 ──[ + login ]──► Radicale
                   (Caddy, Traefik)    app, /api/login,          (CALDAV_URL)
                                       /dav/ passed through
```

- **You log in on the page.** hitome's server checks the username and
  password with Radicale, keeps them in its data volume (encrypted), and hands
  the browser an httpOnly cookie: page code never sees the cookie, and no
  browser ever holds the password.
- **You stay logged in until you log out** (Settings → Account). Updates and
  restarts keep sessions; *Log out everywhere* ends them all.
- **No login is configured anywhere.** The image, the compose file and the
  repo hold no credential. The only setting is where the calendar is.
- The app and the calendar share one address (the app at `/`, CalDAV under
  `/dav/`), so the browser never makes a cross-origin request and no CORS
  setup is needed.
- One person per copy. Radicale accounts are managed in Radicale as always.

Images are built for Intel/AMD and ARM on every `v*` tag (`latest` and the
version), the same commit as the Android APK.

## 1. Compose

```yaml
services:
  hitome:
    image: ghcr.io/miraiconcepts/hitome:latest
    restart: unless-stopped
    environment:
      # Your Radicale, as this container reaches it. On the same compose
      # network that is its service name; otherwise its full address.
      CALDAV_URL: http://radicale:5232/
    volumes:
      - hitome-data:/data # sessions; keep it so updates don't log you out
    # Only your front door needs to reach this. Publish the port only if the
    # front door runs outside Docker:
    # ports:
    #   - 127.0.0.1:3000:3000

volumes:
  hitome-data:
```

Optional hardening that suits the image: `security_opt: [no-new-privileges:true]`,
`cap_drop: [ALL]` (it runs as an unprivileged user on port 3000), and a memory
limit of about 128M.

## 2. The front door (HTTPS)

hitome must be served over **HTTPS** whenever it is reachable from more than
your own machine: the login travels in the request, and installing it as an
app (Chrome's *Install app*, a phone's *Add to Home Screen*) needs HTTPS too.

Caddy:

```caddyfile
calendar.example.com {
	reverse_proxy hitome:3000
}
```

Traefik, Nginx Proxy Manager and the like: a plain proxy to `hitome:3000`. Do
not cache `/api/` or `/dav/`. hitome checks that a login came from its own
address, so the proxy has to pass the original `Host` on (Caddy, Traefik and
Nginx Proxy Manager do). A hand-written Nginx needs
`proxy_set_header Host $host;`, because by default it replaces it with the
upstream's and every login is then refused as cross-site.

**On the internet or only on a private network?** Either works; the login
guards both. On the open internet, keep Radicale itself off it (only hitome
needs to reach Radicale) and use a strong password: hitome slows down
password guessing (each failure after the fifth doubles the wait, up to 15
minutes), but a strong password is still the real lock.

## 3. Verify

```sh
curl -s https://<host>/healthz                                   # ok
curl -s -o /dev/null -w '%{http_code}\n' https://<host>/        # 200
curl -s -o /dev/null -w '%{http_code}\n' -X PROPFIND https://<host>/dav/
                                                                 # 401: logged out
```

Then open the address, log in with your Radicale username and password, and
the calendar appears. If the login screen says the address *doesn't answer
like a calendar server*, check `CALDAV_URL` (the trailing path matters:
it is the address you would give a CalDAV app).

## What to know about security

- **Sessions last until you log out.** The server never expires one; the
  cookie lasts 400 days and renews whenever the app opens. Use "log out
  everywhere" if a browser is lost.
- **The login is stored on the server.** It sits in `sessions.enc` in the data
  volume, encrypted, with its key beside it in the same volume. That protects
  a copied or backed-up file, not a stolen volume. Keep the volume private.
- **Guessing is slowed, not stopped.** After five wrong passwords the login
  waits 30 seconds, doubling to 15 minutes, for everyone: anyone who can
  reach the page can also lock you out for a while. Put the page behind a
  VPN or your front door's own rate limit if it is open to the internet.
- **Use HTTPS.** The session cookie is marked Secure only when the request
  came over HTTPS (or your front door says so with `X-Forwarded-Proto`).
- **Location suggestions** (event editor) send what you type to
  photon.komoot.io. Nothing else leaves your server and your devices.

## Moving from the old setup (before v0.7)

Earlier versions had no login: the host Caddy added the calendar login to
every `/dav/` request from `HITOME_DAV_B64`. To move over:

1. Add `CALDAV_URL` and the `hitome-data` volume to the `hitome` service, as
   above. The port is now **3000** (was 80).
2. Replace the hitome site block's body with a plain
   `reverse_proxy hitome:3000`: no `handle_path /dav/*`, no
   `header_up Authorization`.
3. Remove `HITOME_DAV_B64` from the server `.env` and from the caddy
   service's environment.
4. Pull and restart. Open the address and log in once on each browser.

Clients that talk to Radicale directly (DAVx⁵ on the phone, Apple Calendar)
are unaffected: they keep using Radicale's own address and login.

## Android APK

Shipped from the same `v*` tag: CI builds, signs and publishes the APK as a GitHub
Release, and Obtainium tracks that feed. Full flow in `docs/Release.md`.

## Local web dev

From `app/`, two processes:

- `bun run web:proxy`: Metro on :8082 (under node, never `--bun`).
- `bun run server:dev`: hitome's server on **http://localhost:4000**, passing
  the app through from Metro and `/dav/` to your Radicale. It reads
  `CALDAV_URL` from `app/.env.local` (gitignored) and keeps its sessions in
  `app/.hitome-dev/` (gitignored). Log in on the page as in production.

The e2e suite (`tooling/e2e/run.sh`) runs the same server in a container in
front of a throwaway Radicale with a `test` / `test` account.
