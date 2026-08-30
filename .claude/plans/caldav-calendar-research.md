# CalDAV Calendar — Implementation Research (versions + copy‑paste snippets)

> **As‑of: 2026‑07‑01.** Companion to `caldav-calendar-plan.md` (the locked plan). This file pins
> exact 2026 versions and gives copy‑pasteable setup/usage for the **first‑cut scope**:
> online‑first (no cache), month view, list/create/edit/delete on **Android + Web**, single
> default calendar, credentials from a **gitignored `.env`**, talking to self‑hosted
> **Radicale** (`:5232`) behind **Caddy** on Tailscale.
>
> **Project baseline:** expo `~56.0.11`, react-native `0.85.3` (new arch, always on),
> react `19.2.3`, react-native-web `~0.21`, expo-router `~56.2.10`, TypeScript `~6.0.3`,
> **bun**, Metro, `web.output:"static"`, React Compiler on.
>
> **Top-line risk:** Expo package `latest` dist-tags are now **57.0.0 (SDK 57 shipped)**. This
> project is on **SDK 56** — always install Expo packages with `npx expo install <pkg>` (or
> `bunx expo install`) so you get the SDK‑56 line, **never** `bun add expo-*@latest`.

---

## 1. `tsdav` — CalDAV client vs Radicale

**Version: `tsdav@2.3.0`** (published 2026‑06‑28; `latest`). Pure‑JS, deps `xml-js` + `debug`,
uses **global `fetch`** → Hermes‑safe transport. Officially targets *Browsers, Node ≥18, Bun,
Deno, Cloudflare Workers* — **React Native is not an official target**, so polyfills + a spike
smoke‑test are mandatory (this is the #1 integration risk).

```sh
bun add tsdav
# Hermes/RN polyfills (btoa/atob for Basic-auth base64, TextEncoder for xml handling):
bun add base-64 text-encoding
# fresh UIDs without a crypto polyfill:
bunx expo install expo-crypto
```

### RN 0.85 / Hermes polyfills — import BEFORE tsdav

Hermes still lacks `btoa`/`atob` (needed to build the `Basic` header) and reliable
`TextEncoder`/`TextDecoder`. Add a `polyfills.ts` imported at the very top of `app/_layout.tsx`
(or `expo-router/entry`) **before** any `tsdav` import:

```ts
// src/polyfills.ts
import { decode as atob, encode as btoa } from 'base-64';
import { TextDecoder, TextEncoder } from 'text-encoding';

if (typeof global.btoa === 'undefined') (global as any).btoa = btoa;
if (typeof global.atob === 'undefined') (global as any).atob = atob;
if (typeof global.TextEncoder === 'undefined') (global as any).TextEncoder = TextEncoder;
if (typeof global.TextDecoder === 'undefined') (global as any).TextDecoder = TextDecoder;
```
> `react-native-polyfill-globals` bundles all of these (base‑64 + text‑encoding +
> react‑native‑fetch‑api + react‑native‑url‑polyfill) if you prefer one dep. On **web** these
> globals already exist, so the guards are no‑ops. **PROPFIND/REPORT custom methods** work over
> RN's fetch (OkHttp/URLSession allow arbitrary verbs) — verify in the spike.

### Client (Basic auth) + login + fetchCalendars

```ts
import { DAVClient } from 'tsdav';
import { DAV } from './config'; // §4

export const dav = new DAVClient({
  serverUrl: DAV.url,          // prod: https://<host>/dav/  (same-origin behind Caddy → no CORS)
  credentials: { username: DAV.user, password: DAV.pass },
  authMethod: 'Basic',
  defaultAccountType: 'caldav',
});

await dav.login();                       // PROPFIND: discovers principal + calendar-home-set
const calendars = await dav.fetchCalendars();
const cal = calendars[0];                // single default calendar for the first cut
```

### fetchCalendarObjects (time-range = month window)

```ts
const objects = await dav.fetchCalendarObjects({
  calendar: cal,
  timeRange: {                            // ISO‑8601 strings; server-side time-range REPORT
    start: '2026-07-01T00:00:00Z',
    end:   '2026-08-01T00:00:00Z',
  },
  // expand: true,     // optional: ask Radicale to expand recurrences server-side
  // useMultiGet: true // default; calendar-multiget vs calendar-query
});
// each: { url: string, etag: string, data: string /* raw iCalString */ }
```

### Create (PUT new `.ics`, fresh UID)

```ts
import * as Crypto from 'expo-crypto';

const uid = Crypto.randomUUID();          // Hermes-safe UUID
const res = await dav.createCalendarObject({
  calendar: cal,
  filename: `${uid}.ics`,                  // Radicale keys the object by filename
  iCalString,                              // full VCALENDAR w/ matching UID (build via §2)
});
// capture res: { url, etag? }. If etag absent in the 201, re-fetch the object once for its etag.
```

### Update (etag / `If-Match`)

```ts
await dav.updateCalendarObject({
  calendarObject: {
    url:  existing.url,
    data: newICalString,                   // preserve unknown props — see §2
    etag: existing.etag,                   // sent as If-Match → guards against lost updates (412)
  },
});
```

### Delete

```ts
await dav.deleteCalendarObject({
  calendarObject: { url: existing.url, etag: existing.etag },
});
```

**Known issues / notes**
- **PROPFIND Content‑Type:** tsdav sends `application/xml; charset=utf-8`; Radicale accepts that.
  tsdav **≥2.1.8** added per‑call `fetch` overrides and Radicale‑specific fixes → stay on 2.3.0.
  To force headers/transport, pass per‑call `headers` and/or `fetchOptions`.
- `.well-known/caldav` discovery must survive the proxy — Caddyfile in §5 forwards it.
- **Risk:** RN is unofficial; smoke‑test `login → fetchCalendars → fetchCalendarObjects → PUT →
  re-GET` on **Android (Hermes) + Web** in the spike before building on it.

---

## 2. `ical.js` (+ optional `ical-expander` / `rrule`)

**Versions:** `ical.js@2.2.1` (latest; pure‑JS, zero deps) · `ical-expander@3.2.0` (wraps ical.js
for range expansion) · `rrule@2.8.1` (only needed to *build* RRULEs from UI — ical.js already
parses/serializes/expands recurrence, so rrule is optional).

```sh
bun add ical.js
bun add ical-expander        # optional: easy between(start,end) recurrence expansion
```

### Parse + read (SUMMARY / DTSTART / DTEND / LOCATION / DESCRIPTION / TZID / all-day)

```ts
import ICAL from 'ical.js';

const vcalendar = new ICAL.Component(ICAL.parse(icsString));
const vevent    = vcalendar.getFirstSubcomponent('vevent');
const event     = new ICAL.Event(vevent);

const summary     = event.summary;                              // SUMMARY
const location    = vevent.getFirstPropertyValue('location');   // LOCATION
const description  = vevent.getFirstPropertyValue('description'); // DESCRIPTION
const start       = event.startDate;                            // ICAL.Time
const end         = event.endDate;                              // ICAL.Time
const isAllDay    = start.isDate;                               // VALUE=DATE ⇒ true
const tzid        = start.zone && start.zone.tzid;              // TZID (e.g. 'Asia/Singapore')
const jsStart     = start.toJSDate();                           // → JS Date for the UI
```
> **All-day:** `DTSTART;VALUE=DATE:20260702` ⇒ `start.isDate === true`, and **`DTEND` is
> non‑inclusive** (one day *after* the last day). Render all‑day off `isDate`, never off the time.

### Build a new VEVENT + serialize

```ts
import ICAL from 'ical.js';
import * as Crypto from 'expo-crypto';

const vcalendar = new ICAL.Component(['vcalendar', [], []]);
vcalendar.updatePropertyWithValue('prodid', '-//<app>//caldav//EN');
vcalendar.updatePropertyWithValue('version', '2.0');

const vevent = new ICAL.Component('vevent');
const event  = new ICAL.Event(vevent);
event.uid     = Crypto.randomUUID();
event.summary = 'Lunch';

// Timed event — simplest robust path for the first cut: store as UTC (Z), avoids VTIMEZONE.
const s = ICAL.Time.fromJSDate(new Date('2026-07-02T12:00:00+08:00'), true); // useUTC=true
const e = ICAL.Time.fromJSDate(new Date('2026-07-02T13:00:00+08:00'), true);
event.startDate = s;
event.endDate   = e;

vevent.updatePropertyWithValue('dtstamp', ICAL.Time.now());
vcalendar.addSubcomponent(vevent);
const ics = vcalendar.toString();
```

**All-day build** (note the non‑inclusive DTEND):
```ts
const d = new ICAL.Time({ year: 2026, month: 7, day: 2, isDate: true });
event.startDate = d;
const end = d.clone(); end.day += 1;   // non-inclusive → 1-day event
event.endDate = end;                    // emits DTSTART;VALUE=DATE:20260702 / DTEND;VALUE=DATE:20260703
```
> **TZID sharp edge:** writing `DTSTART;TZID=Asia/Singapore` requires the matching **VTIMEZONE**
> registered in `ICAL.TimezoneService`, or clients mis‑resolve it. For the first cut, **write UTC
> (`Z`)** as above; still *parse* incoming `TZID` correctly (read path handles it). Add proper
> VTIMEZONE emission later if round‑tripping Apple events must keep their original TZID.

### EDIT while PRESERVING unknown props (X-APPLE-\*, ATTENDEE, ORGANIZER) — the non-dropping pattern

**Rule:** parse the *existing* ICS into a Component and mutate **only** the fields you change.
Unknown properties live in the component's jCal array (ical.js keeps them as the `unknown` type)
and survive `toString()`. **Never rebuild a VEVENT from scratch on edit** — that is what drops
`X-APPLE-*`, attendees, organizer, sequence, etc.

```ts
import ICAL from 'ical.js';

export function editPreserving(
  icsString: string,
  changes: { summary?: string; location?: string; start?: ICAL.Time; end?: ICAL.Time },
): string {
  const vcalendar = new ICAL.Component(ICAL.parse(icsString)); // ← keep the original tree
  const vevent = vcalendar.getFirstSubcomponent('vevent');

  // updatePropertyWithValue REPLACES the first match (or adds if absent); leaves all others intact
  if (changes.summary  !== undefined) vevent.updatePropertyWithValue('summary', changes.summary);
  if (changes.location !== undefined) vevent.updatePropertyWithValue('location', changes.location);
  if (changes.start)                  vevent.updatePropertyWithValue('dtstart', changes.start);
  if (changes.end)                    vevent.updatePropertyWithValue('dtend', changes.end);

  // bump revision metadata only — DO NOT touch X-APPLE-*, ATTENDEE, ORGANIZER
  vevent.updatePropertyWithValue('last-modified', ICAL.Time.now());
  const seq = Number(vevent.getFirstPropertyValue('sequence') ?? 0);
  vevent.updatePropertyWithValue('sequence', seq + 1);

  return vcalendar.toString(); // X-APPLE-*, ATTENDEE, ORGANIZER, etc. untouched
}
```
> **Anti-pattern (loses data):** `const v = new ICAL.Component('vevent')` populated with only the
> known fields, then PUT. Use `editPreserving` on every edit. Regression‑test against a real Apple
> event (has `X-APPLE-STRUCTURED-LOCATION`, `ATTENDEE`, `ORGANIZER`) — this is the plan's #1 risk.

### Expand recurrences over a range

**Option A — `ical-expander` (simplest):**
```ts
import IcalExpander from 'ical-expander';

const expander = new IcalExpander({ ics: icsString, maxIterations: 1000 });
const { events, occurrences } = expander.between(
  new Date('2026-07-01'), new Date('2026-08-01'),
);
const all = [
  ...events.map(e => ({ start: e.startDate, end: e.endDate, item: e })),
  ...occurrences.map(o => ({ start: o.startDate, end: o.endDate, item: o.item })),
];
```

**Option B — ical.js native iterator (no extra dep):**
```ts
const event = new ICAL.Event(vevent);
if (event.isRecurring()) {
  const it = event.iterator();
  const rangeEnd = ICAL.Time.fromJSDate(new Date('2026-08-01'));
  let t;
  while ((t = it.next()) && t.compare(rangeEnd) < 0) {
    const { startDate, endDate } = event.getOccurrenceDetails(t);
    // push occurrence into the month view
  }
}
```
> Recurrence *editing* is deferred/simple‑only (plan: none/daily/weekly/monthly, whole‑series).

---

## 3. `react-native-calendars` — month view (Android + Web)

**Version: `react-native-calendars@1.1314.0`** (latest, ~5 mo old). **JS‑only, no native
linking** → runs in Expo Go, dev builds, **and RN Web**. `peerDependencies` are empty (loose):
works with React 19 / RN 0.85. Because it ships **no Fabric native views**, it is **new‑arch
compatible** by construction.

```sh
bun add react-native-calendars
```

### Web compatibility (important)

- The **`<Calendar>` month component is safe on RN Web (Metro)** — pure JS layout, no
  RecyclerListView. This is exactly the first‑cut surface.
- **Web‑fragile:** `Agenda`, `CalendarList`, `ExpandableCalendar`, `TimelineList` depend on
  **RecyclerListView** (needs a bounded parent size; historically broken on web). **Avoid these on
  web for now.** Old webpack "mixed `import`/`module.exports`" errors are largely mooted by
  **Metro** (Expo's bundler), so no special transpile config is normally needed for `<Calendar>`.
- **Jest:** if unit‑testing screens, add `react-native-calendars` to `transformIgnorePatterns` so
  jest‑expo transpiles it.

### `<Calendar>` month view — markedDates / onDayPress / theming

```tsx
import { useState } from 'react';
import { Calendar } from 'react-native-calendars';

export function MonthView() {
  const [selected, setSelected] = useState('2026-07-01');
  return (
    <Calendar
      current={'2026-07-01'}
      firstDay={1}                                   // week starts Monday (plan default)
      onDayPress={(day) => setSelected(day.dateString)} // day.dateString = 'YYYY-MM-DD'
      markedDates={{                                  // MUST be a new object ref to re-render
        '2026-07-02': { marked: true, dotColor: '#E66000' },
        [selected]:   { selected: true, selectedColor: '#208AEF' },
      }}
      theme={{
        todayTextColor: '#E66000',
        arrowColor: '#E66000',
        selectedDayBackgroundColor: '#208AEF',
      }}
    />
  );
}
```
> `markedDates` must be replaced **immutably** (new object each render) or updates won't show.

**If `<Calendar>` ever proves inadequate on web:** the strongest RN calendar alternatives
(`@howljs/react-native-calendar-kit`) are **native‑focused** (Reanimated/Gesture‑Handler,
iOS/Android) and **not** web targets, so they don't help the single‑codebase goal. Recommendation:
**keep `react-native-calendars` `<Calendar>`** for month view on both platforms; if a richer
list/agenda is needed later, render a plain FlatList/day‑list yourself rather than the
RecyclerListView‑backed components.

---

## 4. Env / config in Expo SDK 56

**Recommendation for the personal first cut: `EXPO_PUBLIC_*` via `process.env`** (Metro‑inlined at
build time). Simpler than `app.config.ts` `extra` + `expo-constants`, and adequate here.

- Metro **replaces `process.env.EXPO_PUBLIC_[NAME]`** literals with the `.env` value at build time.
- **Embedded in the bundle, not secret** — Expo docs are explicit. **Fine for this project:** the
  web build is same‑origin behind Caddy on Tailscale and the APK is sideloaded to your own device.
  Move the password to `expo-secure-store` + in‑app settings later (see plan / §7).
- **Must** be read with full dotted access: `process.env.EXPO_PUBLIC_X`. Destructuring
  (`const { EXPO_PUBLIC_X } = process.env`) or bracket access won't be inlined.
- Restart the dev server after editing `.env` (values are baked at bundle time).

`.env` (**gitignore this**):
```dotenv
EXPO_PUBLIC_DAV_URL=https://<app>.<tailnet>.ts.net/dav/
EXPO_PUBLIC_DAV_USER=carrein
EXPO_PUBLIC_DAV_PASS=your-radicale-app-password
```

`.env.example` (**commit this**, no secrets):
```dotenv
EXPO_PUBLIC_DAV_URL=https://your-host/dav/
EXPO_PUBLIC_DAV_USER=your-username
EXPO_PUBLIC_DAV_PASS=your-app-password
```

Read snippet:
```ts
// src/config.ts
export const DAV = {
  url:  process.env.EXPO_PUBLIC_DAV_URL!,
  user: process.env.EXPO_PUBLIC_DAV_USER!,
  pass: process.env.EXPO_PUBLIC_DAV_PASS!,
};
```

> ⚠️ **gitignore gap:** `app/.gitignore` currently ignores only `.env*.local` — **not `.env`**.
> A committed `.env` would leak the password. Add `.env` to `app/.gitignore`:
> ```gitignore
> # local env files
> .env
> .env*.local
> ```

**Alternative — `app.config.ts` `extra` + `expo-constants`** (`expo-constants@~56.0.18` already in
deps): use only if you need non‑`EXPO_PUBLIC_` naming or values computed at config time.
```ts
// app.config.ts
export default { expo: { /* ... */ extra: { davUrl: process.env.DAV_URL } } };
// read: import Constants from 'expo-constants';  Constants.expoConfig?.extra?.davUrl
```
`extra` is *also* embedded (not secret) — no security advantage over `EXPO_PUBLIC_` here.

---

## 5. Expo web **static** export + Docker + same-origin Caddy

### Export

```sh
bunx expo export --platform web      # → ./dist
```
With `web.output:"static"` + expo-router, `dist/` contains: **one HTML file per route** (e.g.
`index.html` and nested route HTML, statically prerendered), the JS bundles under
`dist/_expo/static/js/web/*.js`, hashed assets, and **everything from `public/` copied to the
`dist/` root**. Client hydrates after load. Test locally with `bunx expo serve` (serves `dist/`
at `:8081`, HTTP‑only). *(Cite: Expo "Publish websites" and "Static rendering" docs.)*

### Multi-stage Dockerfile (bun build → Caddy static server)

**Recommendation:** serve `dist/` with **Caddy `file_server` in‑container** — production already
fronts with Caddy, so one image can serve the app *and* reverse‑proxy Radicale on one origin
(kills CORS). Alternatives: `nginx` (needs `try_files` + `proxy_pass` config) or `serve`/`expo
serve` (static only — then Radicale must be proxied by an outer Caddy anyway). If your host Caddy
is the entrypoint, you can even skip the container and point Caddy's `root` at `dist/`.

```dockerfile
# ---- build ----
FROM oven/bun:1 AS build
WORKDIR /app
COPY app/package.json app/bun.lock ./
RUN bun install --frozen-lockfile
COPY app/ .
RUN bunx expo export --platform web       # → /app/dist

# ---- serve ----
FROM caddy:2-alpine
COPY --from=build /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
EXPOSE 80
```

### Caddyfile — app at `/`, Radicale at `/dav/*`, ONE origin

```caddyfile
<app>.<tailnet>.ts.net {
    encode gzip

    # CalDAV — strip /dav before proxying; X-Script-Name makes Radicale emit hrefs under /dav
    handle_path /dav/* {
        reverse_proxy radicale:5232 {
            header_up X-Script-Name /dav
        }
    }

    # Static web app (expo-router output:static)
    handle {
        root * /srv
        try_files {path} {path}.html /index.html   # per-route .html, then SPA fallback
        file_server
    }
}
```
- `handle_path /dav/*` **strips the `/dav` prefix** before forwarding; `header_up X-Script-Name
  /dav` tells Radicale to prefix all CalDAV `href`s with `/dav` so discovery/`.well-known` resolve
  same‑origin. (Verified against the Caddy‑community Radicale thread + Radicale reverse‑proxy docs.)
- App config: `EXPO_PUBLIC_DAV_URL = https://<host>/dav/` → **same origin → no CORS work**.
- `try_files … {path}.html` serves expo-router's per‑route static HTML; `/index.html` is the
  client‑route fallback.

### Dev-time cross-origin (`expo start --web` on `:8081`)

Metro dev server on `:8081` is a **different origin** than Radicale → CORS. **Native Android is
never subject to CORS** (point it straight at the Tailscale URL). For web dev, pick one:

**(Recommended) local dev proxy — one origin via Caddy on `:8080`:**
```caddyfile
:8080 {
    handle_path /dav/* {
        reverse_proxy <RADICALE-HOST>:5232 { header_up X-Script-Name /dav }
    }
    handle {
        reverse_proxy localhost:8081   # Metro dev server (also proxies the HMR websocket)
    }
}
```
Browse `http://localhost:8080` and set `EXPO_PUBLIC_DAV_URL=http://localhost:8080/dav/` for web dev.

**(Simpler) temporary CORS:** allow `http://localhost:8081` on Radicale/Caddy **for dev only**.
Prod is same‑origin so this rule never ships.

---

## 6. EAS Android APK (installable, not AAB)

Requires a **free Expo account** (`eas login`). Use `bunx eas-cli@latest` (or `bun add -g
eas-cli`). **`eas-cli` targets whatever SDK the project declares — no SDK‑56‑specific flag.**

> ⚠️ **`app.json` is missing `android.package`** — EAS build will fail without it. Add a
> reverse‑DNS id, e.g. `"android": { "package": "<app package id>", ... }`.

`eas.json` — `preview` profile emits an installable **`.apk`** (vs the default `app-bundle`/AAB):
```json
{
  "cli": { "version": ">= 16.0.0", "appVersionSource": "remote" },
  "build": {
    "preview": {
      "distribution": "internal",
      "android": { "buildType": "apk" }
    },
    "production": {
      "android": { "buildType": "app-bundle" }
    }
  }
}
```
Build:
```sh
bunx eas-cli login
bunx eas-cli build --platform android --profile preview   # → downloadable .apk + shareable install link
```

**Later CI:** a GitHub Actions workflow can run `eas build` (or `eas build --local`), then attach
the `.apk` to a **GitHub Release**; **Obtainium** watches the repo's releases for auto‑update.

---

## 7. Deferred (one line + version each)

- **`expo-sqlite`** — offline cache. SDK‑56 line ~`56.0.x` (install `bunx expo install
  expo-sqlite`; `latest` tag is `57.0.0` for SDK 57). Web runs on **wa‑sqlite/OPFS** and needs a
  **cross‑origin‑isolated** page (COOP/COEP headers); native Android works directly. **Verify OPFS
  on web in the spike.**
- **`expo-secure-store`** — for the DAV app password later. SDK‑56 line ~`56.0.x` (`latest`
  `57.0.0`). **Native‑only** (Android Keystore) — **no web support**; `Platform.select` a fallback
  (in‑memory / `localStorage`) on web.
- **`expo-notifications`** — VALARM → local reminders. **SDK‑56 = `56.0.19`** (`latest` `57.0.2`).
  Android exact alarms need `SCHEDULE_EXACT_ALARM`/`USE_EXACT_ALARM` permission + plugin config;
  local notifications don't need FCM. **Requires a dev build** (limited in Expo Go).
- **`react-native-android-widget`** — home‑screen agenda widget. **`0.20.3`** (2026‑05‑02); peer
  `expo >= 54` (SDK 54+ are all new‑arch, so new‑arch is *implied* but **not documented for RN
  0.85/SDK 56**). Config plugin ships **native Android** code → **dev build only, Android‑only, no
  web**. **Verify the SDK‑56 build in the spike; native Glance fallback if it breaks.**

---

## Risk flags — RN 0.85 / SDK 56 (2026‑07‑01)

1. **SDK 57 already shipped** (Expo `latest` = 57.0.0). Fast‑moving ecosystem — pin the SDK‑56
   line via `expo install`; don't grab `@latest` for any `expo-*` package.
2. **`tsdav` on RN/Hermes is unofficial** (top risk). Needs `btoa/atob`+`TextEncoder` polyfills;
   smoke‑test PROPFIND/REPORT/custom verbs + Basic auth on Android **and** Web in the spike.
3. **`ical.js` VTIMEZONE on write** — emitting non‑UTC `TZID` needs a registered VTIMEZONE. Write
   **UTC** for the first cut; parse incoming `TZID` correctly.
4. **`react-native-calendars` web** — only `<Calendar>` (month) is web‑safe; Agenda/List/Timeline
   use RecyclerListView (web‑fragile). Stay on `<Calendar>`.
5. **`react-native-android-widget` new‑arch on RN 0.85 unverified** — spike it; Glance fallback.
6. **`expo-sqlite` OPFS on web** (cross‑origin isolation) and **`expo-secure-store` has no web** —
   both need Platform guards / verification (deferred, but affects later phases).

---

## Sources (fetched 2026‑07‑01)

- tsdav — [npm](https://www.npmjs.com/package/tsdav) · [GitHub](https://github.com/natelindev/tsdav) · [fetchCalendarObjects docs](https://tsdav.vercel.app/docs/caldav/fetchCalendarObjects) · [davRequest](https://tsdav.vercel.app/docs/webdav/davRequest) · registry `latest` = 2.3.0
- Hermes base64/TextEncoder — [react-native-polyfill-globals](https://www.npmjs.com/package/react-native-polyfill-globals) · [Hermes atob/btoa issue #1178](https://github.com/facebook/hermes/issues/1178)
- ical.js — [Common Use Cases wiki](https://github.com/kewisch/ical.js/wiki/Common-Use-Cases) · [Convert to iCalendar wiki](https://github.com/kewisch/ical.js/wiki/Convert-to-iCalendar-(rfc5545)) · [all-day #353](https://github.com/mozilla-comm/ical.js/issues/353) · [ical-expander](https://github.com/mifi/ical-expander) · [rrule](https://www.npmjs.com/package/rrule)
- react-native-calendars — [GitHub](https://github.com/wix/react-native-calendars) · [web issue #521](https://github.com/wix/react-native-calendars/issues/521) · [RecyclerListView size #1908](https://github.com/wix/react-native-calendars/issues/1908) · registry `latest` = 1.1314.0
- Expo env vars — [Environment variables in Expo](https://docs.expo.dev/guides/environment-variables/)
- Expo web export — [Publish websites](https://docs.expo.dev/guides/publishing-websites/) · [Static rendering](https://docs.expo.dev/router/web/static-rendering/)
- Caddy + Radicale — [Caddy community thread](https://caddy.community/t/radicale-reverse-proxy-caddy-2-0/8580) · [reverse_proxy directive](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy) · [Radicale docs](https://radicale.org/master.html)
- EAS APK — [Build APKs](https://docs.expo.dev/build-reference/apk/) · [eas.json](https://docs.expo.dev/build/eas-json/)
- SDK 56 — [Expo SDK 56 changelog](https://expo.dev/changelog/sdk-56) · [New Architecture](https://docs.expo.dev/guides/new-architecture/) · registry dist-tags (expo-notifications sdk-56 = 56.0.19; expo-sqlite/secure-store `latest` = 57.0.0)
- react-native-android-widget — [docs](https://saleksovski.github.io/react-native-android-widget/) · registry `latest` = 0.20.3 (peer `expo >= 54`)
