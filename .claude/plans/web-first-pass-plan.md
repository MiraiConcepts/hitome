# Web first pass: plan

Goal: make the web build feel like a real desktop calendar (click to add,
roomy editor, clear connection state) without splitting the design language
from Android. Surgical changes; web-only code goes in `*.web.ts(x)` or behind
`useIsWide()` so Android is untouched.

Survey done 2026-10-06 on v0.5.2 (live site, local :4000, test stack :8881).

## What I found

Speed is fine: Lighthouse desktop 96 (LCP 1.3 s, no layout shift, ~1 MB).
Only nearby weeks are drawn (about 1,400 elements). Not a priority.

### A. Connection (the "Offline · cannot find principal URL" problem)

1. Radicale's 401 carries `WWW-Authenticate: Basic`. Nothing strips it, so
   Chrome pops its own grey login box. That box invites typing the real
   password into the browser, against the "no credentials in the browser"
   rule. Cancelling it leaves tsdav with no principal, so the banner shows
   raw library text.
2. Web never shows a setup or status screen: it always assumes `/dav/` on
   the same origin. The web `setup-screen.tsx` and `server-form.tsx` (with
   username/password fields) are effectively dead code on web.
3. A failure is a small banner and a mostly empty grid. No plain words
   about what is wrong or what to do.
4. Locally, the dev proxy's saved login is stale (user to refresh `.env`).

### B. Mouse and keyboard

5. Clicking an empty day does nothing. Adding on a day needs a long press
   (a phone gesture). The only other way is +, which always starts on
   today, even while viewing another month.
6. Arrow keys do not move between days; no shortcuts (new, today, month
   back/forward).
7. No hover feedback on days or events beyond the pointer cursor.

### C. Wide-window layout

8. Event editor dialog is 480 px wide with one column. On a 700 px tall
   window Location and Notes are below the fold. Its date heading floats on
   the dimmed backdrop above the card instead of inside it.
9. Time fields use the browser picker ("01:00 PM") while the rest of the
   app says "13:00".
10. Month grid text (chips 11 px, day numbers) is phone-sized on a 1440 px
    window, so wide cells look empty and sparse.
11. Settings is one 560 px column in the middle of a wide window.

### D. Wording that only makes sense on a phone (web only)

12. "Match phone (Monday)", "Tap a calendar to change", "Shown on the
    calendar and widget", and a reminder preview with JOIN / SNOOZE buttons
    that browser notifications never show.
13. Web reminders only fire while a hitome tab is open; settings does not
    say so.
14. Local build's About shows 0.5.0 while app.json says 0.5.2 (to check).

## Proposed work, in order

1. **Stop the browser login popup.** `header_down -WWW-Authenticate` in
   `tooling/dev-proxy/Caddyfile`, and the same line documented for the host
   Caddy in `docs/Deploy.md` (that config lives on the server, outside this
   repo).
2. **Web connection screen.** When the calendar cannot be reached and
   nothing has loaded yet, show a full screen in the setup screen's style
   (icon, name, one plain sentence of what is wrong, Retry). Reuse
   `classifyConnectError` / `connectFailureMessage`. After something has
   loaded, keep the banner but with the same plain wording. Remove the dead
   web login form.
3. **Click to add** (see question 1).
4. **Roomier editor on wide windows** (see question 3). Heading inside the
   card; Esc closes; Cmd/Ctrl+Enter saves.
5. **+ starts on the day you are looking at**: today if today is in the
   visible month, else the 1st of that month.
6. **Keyboard**: arrows move between days, Enter opens, N new event,
   T today, PageUp/PageDown month. Hover tint on days and events.
7. **24-hour time fields** on web so the editor agrees with itself.
8. **Wide grid scale**: larger chip text and day numbers above 1100 px.
9. **Settings on wide windows** (see question 4) and web wording for D.12
   and D.13.

Each step is its own commit, checked at 1440, 1024 and 390 wide, with the
e2e suite run at the end. Android files untouched unless shared copy changes.

## Open questions (asked 2026-10-06)

1. Click a day: empty day opens a new event; a busy day opens its list,
   which gains an Add button.
2. Side panel: not yet. Bigger grid text on wide windows only.
3. Editor: wider (about 840 px), two columns. Left: title, calendar,
   times, repeat, alert. Right: location, notes.
4. Settings: two columns of cards on wide windows; one column on phones.

## Build log (2026-10-06)

Done, all web-only unless noted; Android behaviour unchanged.

1. Login popup: `header_down -WWW-Authenticate` in the dev proxy; same line
   documented for the host Caddy in docs/Deploy.md (server config, outside
   the repo: still to apply there).
2. Connection: caldav/client.ts re-asks the server when discovery fails, so
   a 401/403 surfaces as a refused login and a 5xx as the server being down
   (was "cannot find principalUrl" for both; shared with Android's dormant
   CalDAV path). New `webConnectionProblem` wording (tested). A calendar
   that never loaded gets a full screen (connection-problem.tsx, setup
   screen look, Try again); after a load, a floating bar at the bottom.
   The bar used to sit in the grid's flow and, appearing after anchoring,
   threw the grid to July 2022: fixed by floating it.
3. Click to add: an empty day opens a new event; the day list gains Add
   event. Day list backdrop moved behind the card (was a button wrapping
   buttons: invalid HTML warning) and kept out of the tab order.
4. Editor: 840 px, two columns, bordered card, Cmd/Ctrl+Enter saves.
5. + starts on the visible month (today, or that month's 1st).
6. Keys: arrows between days (crossing months), Enter opens, N, T,
   PageUp/PageDown. Hover wash on days, fade on events. Square accent
   focus ring for controls (global.css).
7. Not done: 24-hour time fields. Chrome takes 12/24 h from the OS region,
   so the user's browser may already show 13:00. Asked.
8. Grid scale 1.15 at >= 1100 px (grid-scale.ts; read at load). A packed
   day shows one fewer event before "+N".
9. Settings: two columns at >= 1150 px; web wording (Click, Match browser,
   no widget); reminder preview replaced on web by "Reminders arrive only
   while this page is open in a tab."

Checks: typecheck, lint, format, 298 unit tests pass; e2e run at the end.
