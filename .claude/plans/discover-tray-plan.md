# Discover tray: plan

Status: built 2026-10-13, uncommitted. **Redesigned the same day:** the tray
panel and the read-only sheet were replaced by discover mode on the grid
itself (see "Discover mode" below); the rest of this plan (roles, the
backend contract, free / cancelled, `setGoing`) stands. Still to do by hand:
the DAVx⁵ checks under "To verify while building", and a run of
`tooling/e2e/run.sh discover.spec.ts`.

## Discover polish (built 2026-10-14, uncommitted)

Asked after using discover mode on the phone. Picked from a mockup.

1. **Header crossfades** into discover colours and back (about 260 ms): the
   bar and the weekday row fade black to orange, their ink orange to black.
   Reanimated `interpolateColor` on one shared value, so it runs on the UI
   thread beside the cascade.
2. **The discover button has no square when on:** its icon takes the bar's
   ink like the other buttons (black on orange). The orange bar is the "on".
3. **No count badge** on the discover button.
4. **Share-month icon** becomes Tabler `photo-share` (a new body in
   `icon-paths.ts`, `PhotoShareIcon` in `icons.tsx`).
5. **Refresh by pulling, not a button.** The header keeps four: discover,
   share, add, settings. The month grid is a list that never sits at its top
   (it starts years back and pages by month), so a list's own pull to
   refresh would never fire; instead a pull down on the header (and the
   weekday row) refreshes, with the existing loading bar as the feedback.
   The app already refreshes on open and every minute while open, so this is
   rarely needed.
6. **Not-going events: dashed outline only.** The chip's bar goes in the
   `open` look; filled (going) is unchanged.
7. **Discover mode taps open the day list, always.** A tap on a day or on any
   event in it opens that day's list (nothing is marked from the grid). The
   header hint becomes "Tap a day to see what's on". Hold still opens an
   event's page.
8. **The day list in discover mode:** only that day's discover events; each
   row's trailing cell is a checkbox (going) instead of share and delete; a
   tap on the title opens the event's page (↗); no Add event button.
9. **Messages:** "Discovered!" when you go, "Removed" when you un-go, both
   with Undo, no title. Fix the toast running off both edges on a long
   message (its text needs to shrink and cut off with an ellipsis, not push
   the row wider), for every message, not only these.

Files: `month-header.tsx` (1–5), `month-screen.tsx` (5, 7, 9),
`event-chip.tsx` (6), `day-popover.tsx` (8), `icon-paths.ts` / `icons.tsx`
(4), gallery specimens for each, `tooling/e2e/discover.spec.ts` (tap the day,
tick the box). Unit tests: none of this is pure logic beyond what is covered;
the e2e spec covers the flow.

Added the same day: **today is outlined, not filled** (all views), so its
events read as any other day's: blue, fading to orange in discover mode
(whose events are often blue) with the header (`today-mark.tsx`). And the
discover hint line is gone: the header keeps today's date.

Round 3 (2026-10-14): the discover button is a **telescope**; not-going
events are a **soft tint** (dashes broke up across rows, a bar read as
already going); today is a **bar across the top** of its cell (blue, orange in
discover mode; a fill, an outline and a tint each got in the events' way);
film links are the calendar's own colour, underlined; all-day bars and
chips stop a full rule short of the next day, so the line between days
shows; the Settings switch is a dark tray with the pick
outlined in orange; every message comes from `constants/messages.ts` (one
vocabulary, picked message by message), with a test button in Settings.

Round 4 (2026-10-14/15): events still covered the lines (cells were
`flex: 1` with a right rule, so Mon–Sat came out wider than the strips laid
over the row in sevenths). Events now live **inside their day's box**, so
they cannot reach a line; a multi-day event draws a piece per day, its first
day in a row titled on the full colour and the later days **one long fade**
toward the ground, untitled (repeated titles were too busy). Today went
through a filled square behind the date, a sun at the end of its line (both
rejected) to a **wash over the whole cell** (blue, orange in discover mode).
Not going went dotted top and bottom, then diagonal stripes (titles hard to
read), and settled **inverted**: not going is filled in the calendar's colour,
going is a light fill with the title in that colour; going events come
**first** in each day. Pull to refresh shows only the app's **spinner** in
the gap (the boxed mark and a filling line both went); the loading bar stays
at the header's top. Closing the day list takes its message with it (it
faded in again over the calendar).

Earlier: the discover button was a ticket; the web keeps its refresh button
(a desktop has room, nobody pulls with a mouse), the phone pulls the header.

## Discover mode (replaces the tray, 2026-10-13)

Asked after trying the tray: no pop-ups, turn the calendar itself over.
Transition picked from ten in a mockup
(https://claude.ai/artifact/7mfHa8zgNFNxsiUmF4wzpm): **cascade**, the days
turning over one by one from the sparkle's corner. On the phone (2026-10-14)
the 3D turn (slices of a snapshot of the grid) stuttered, and the snapshot
was blurry at 1x or slow at full density; settled on tiles in the grid's
ground that fade away day by day, opacity only, and on hiding your own
events in discover mode so the switch redraws less. Judge speed on a release
build: the debug build drew a third of the frames.

| Question                              | Answer                                                        |
| ------------------------------------- | ------------------------------------------------------------- |
| Header in discover mode               | Turns orange, black ink                                       |
| Your own events                       | Hidden in discover mode                                       |
| Discover events                       | Outlined in the calendar's colour = not going; filled = going |
| Tap                                   | Going / not going, with the Undo toast                        |
| Hold                                  | Opens the event's page (URL, else first link in notes)        |
| Tapping a going event on the calendar | Opens its page (no sheet)                                     |
| New events                            | None from discover mode (hold and empty-day tap do nothing)   |

Built as: `CascadeCover` (42 fading tiles over the grid,
`cascade-cover.tsx`), the grid switched under them in the tap's frame; `EventLook` on
`EventChip` / `EventBanner`, passed through `MonthGrid` / `WeekRow` with an
`onHoldEvent`; the header's `discover` prop. `discover-tray.tsx` and
`tray-event-sheet.tsx` are gone.

## Goal

Calendars that a backend fills with things to do (Filmhouse showings and the
like) stay off the month grid. A sparkle button in the header opens a tray
under the month that lists their events. Tapping an event's name opens its
website; **+** means "I'm going", and the event then shows on the calendar
like one of your own; **✓** takes that back.

Mockup: https://claude.ai/artifact/Hvk5h6L6T8KFbGM5DNHZrA

## Decisions (asked 2026-10-13)

| Question                                    | Answer                                                                                                                                                             |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Entry point                                 | Sparkle button in the month header, with a count of events not yet marked; tap to open or close the tray (option C in the mockup)                                  |
| Grid while the tray is open                 | Unchanged, plus small marks in each day that has tray events                                                                                                       |
| Tap an event's name                         | Opens its website                                                                                                                                                  |
| **+** / **✓**                               | Marks / unmarks "going"; both have Undo                                                                                                                            |
| Copy or mark                                | **Mark in place** (Way 2). One event, no copy, so nothing drifts. Recommended by the backend session too                                                           |
| How the mark is stored                      | The event's own busy/free field: `TRANSP:TRANSPARENT` = not going, `TRANSP:OPAQUE` = going. On Android, `Events.AVAILABILITY`, which DAVx⁵ maps to and from TRANSP |
| Reminder on **+**                           | Yes: the default alert from Settings (`alert-pref.ts`), added as a VALARM / reminder row. **✓** removes it                                                         |
| Going events on the Android widget          | Yes                                                                                                                                                                |
| Going event that gets cancelled             | Shown crossed out until its day has passed, then gone                                                                                                              |
| Editing a tray event                        | Not allowed (the backend owns title and time and would change them back). The sheet offers going / not going, the reminder, and the link                           |
| Which calendars feed the tray               | Settings › Calendars: each row's eye becomes a three-way switch, on the calendar / in the tray / hidden                                                            |
| Tray calendar as the default for new events | Not allowed; picking "in the tray" on the default moves the default to the first calendar shown on the grid                                                        |

## Backend contract (agreed with the backend session)

hitome relies on these; the backend's shared sink implements them for
holidays and Filmhouse:

1. Writes only the fields it owns (`SUMMARY`, `DTSTART`, `DTEND`, `URL`,
   `DESCRIPTION`, `STATUS`) and keeps everything else, including `TRANSP` and
   any `VALARM`. TRANSP is set to TRANSPARENT on create and never touched
   again.
2. Never deletes an event marked OPAQUE: when it vanishes from the source it
   becomes `STATUS:CANCELLED`. Unmarked events are deleted.
3. Sends `If-Match` on every PUT and DELETE, skipping an event on 412.

Built 2026-10-13 in the backend repo: `radicale/feeds/feeds_sink.py` (sink),
`radicale/feeds/filmhouse.sync.py` (Filmhouse). Owned fields, top-level VEVENT
lines only: `SUMMARY`, `DTSTART`, `DTEND`, `DURATION`, `URL`, `DESCRIPTION`,
`STATUS`, `DTSTAMP`. Everything else (TRANSP, every VALARM, VTIMEZONE, X-
lines DAVx⁵ adds) is kept byte for byte.

- **A missing TRANSP counts as OPAQUE** (the RFC default), on both sides.
  DAVx⁵ may drop TRANSP for a busy event, so hitome reads "no TRANSP" as
  going too, and always writes `TRANSP:TRANSPARENT` explicitly when unmarking
  (never removes the line).
- Sold-out showings keep their UID (matched by film + start time), so a mark
  survives a sell-out. A UID still changes when a holiday moves date; the
  mark then stays on the old event, which turns cancelled.
- Unmarked past showings are deleted 30 days after they end; marked ones are
  kept, so past going events stay on the grid as history.

The link: Filmhouse writes the booking page as `URL`, and the same booking
link first in `DESCRIPTION` (film page second). On web, `CalEvent.link`
already holds URL. On Android the store does not read URL (DAVx⁵ keeps it
outside the Events table), so the tray uses the first link in the
description there, and on web when URL is empty. Both give the booking page.

Example, a marked showing after a run moved it (times are UTC):

```
BEGIN:VEVENT
UID:filmhouse-1813@hitome
DTSTAMP:20261013T024500Z
DTSTART:20261013T100000Z
DTEND:20261013T115400Z
SUMMARY:The Violinist
URL:https://filmhouse.sg/filmhouse-singapore/booknow/1813
DESCRIPTION:Book: https://filmhouse.sg/filmhouse-singapore/booknow/1813\nFi
 lm: https://filmhouse.sg/film/195/the-violinist\n114 min · PG
STATUS:CONFIRMED
TRANSP:OPAQUE
BEGIN:VALARM
ACTION:DISPLAY
DESCRIPTION:The Violinist
TRIGGER:-PT30M
END:VALARM
END:VEVENT
```

Use this example, and the same event unmarked (`TRANSP:TRANSPARENT`, no
VALARM), as test fixtures for the web parser and `setGoing`.

## Shape

### 1. Calendar roles (`src/config/calendar-visibility.ts`)

Generalise "hidden" to a role per calendar: `shown` (default) | `tray` |
`hidden`. Keep the same snapshot-cache store (per device, like today), and
read an old stored list of hidden URLs as `hidden`. Exports:
`useCalendarRoles()`, `ensureCalendarRoles()`, `setCalendarRole(url, role)`,
`roleOf(eventUrl, roles)`. Update the three current consumers
(`month-screen.tsx`, `widget/fetch-upcoming.ts`, `calendars-section.tsx`).

Display rule, used by the grid and the widget alike:

- `shown`: drawn, except cancelled events (as now).
- `tray`: drawn only when going; a going cancelled event is drawn crossed out
  until its day ends.
- `hidden`: never drawn. Reminders still ring (as now).

### 2. Event fields

`CalEvent` gains:

- `free?: boolean` (built as this, set only when true, so ordinary events
  are unchanged): TRANSP is TRANSPARENT (web) / AVAILABILITY is FREE
  (Android). In a tray calendar, going = not free; a missing TRANSP is busy.
- `cancelled?: boolean`, on single events only (a cancelled occurrence or
  series is still never read). Alarms skip cancelled events
  (`alarms/occurrences.ts`).

Web (`caldav/expand.ts`): read TRANSP. Cancelled events are skipped today in
three places; keep them instead, flagged `cancelled`, and let the display
rule drop them. Check the other consumers of expanded events (alarms,
widget, day popover, search for `cancelled`) so a cancelled event still never
rings and never shows outside a tray calendar.

Android (`store/contract.ts`, `store/events.ts`, `store/map.ts`): add
`availability` to the instance and event columns; the month query at
`store/events.ts:182` stops filtering cancelled rows in SQL and leaves it to
the display rule (or keeps the filter for non-tray calendars).

### 3. Marking

New `setGoing(event, going, alertMinutes)` in both data layers, exported
through `src/data/events`:

- Web (`caldav/events.ts`): edit the event's raw ICS (as updateEvent does, so
  unknown properties survive), set TRANSP, add or remove a hitome VALARM via
  `valarm.ts`, PUT with If-Match. Built as `markGoing` (ics.ts) + `setGoing`.
  No retry on 412: it surfaces as a ConflictError like every other write, and
  the tray refetches (a feed run between fetch and tap is rare).
- Android (`store/events.ts`): update `Events.AVAILABILITY`, insert or delete
  the reminder row, through the existing pending-write path so Undo and the
  offline queue work.

Recurring tray events: mark the whole series; no per-occurrence marking.

### 4. Tray UI

New `components/calendar/discover-tray.tsx`, opened from a new sparkle
button in `month-header.tsx` (shown only when some calendar has the `tray`
role; badge = upcoming unmarked tray events in the visible month).

- Bottom panel over the lower part of the grid, as in the mockup; Esc and
  the chevron close it.
- Rows: date, title, time and place (or "you have X" when the day already has
  an event), ↗ when there is a link. Name opens the link
  (`Linking.openURL`); **+ / ✓** toggles going, with an Undo toast.
- Filter chips when more than one calendar feeds the tray.
- Past events dimmed; cancelled ones hidden from the tray.
- Day marks in grid cells while open (`week-row.tsx`).

### 5. Going events on the grid

Drawn like any event in their calendar's colour and mark. Cancelled ones
crossed out. Opening one shows a read-only sheet (title, time, place, link)
with "Not going" and the reminder field; no edit, move or delete. Find where
the editor decides between edit and view (`use-event-editor.ts`) and add a
`readOnly` case for tray-calendar events.

### 6. Settings (`components/settings/calendars-section.tsx`)

Replace the eye toggle with the three-way switch from the mockup (eye /
sparkle / eye-off) and add a legend line for the sparkle: "In the discover
tray. Kept off the calendar and widget until you're going."

### 7. Widget

`widget/fetch-upcoming.ts` applies the same display rule, so going events
appear. Meeting-link sniffing is unchanged.

### 8. Gallery and tests

- Gallery: specimens for the tray (open, empty, multiple calendars), the
  header button with badge, the three-way switch, a crossed-out event.
- Unit tests: display rule; role migration from the old hidden list; web
  `setGoing` ICS round trip (TRANSP + VALARM added and removed, unknown
  properties kept); Android map of `availability`.
- e2e (`tooling/e2e`): seed a tray calendar in the throwaway Radicale, mark
  an event, check it appears on the grid, unmark, check it goes.

## To verify while building

- DAVx⁵ maps `TRANSP` ↔ `Events.AVAILABILITY` both ways (it should; check
  with the dev phone before relying on it).
- A reminder row added by hitome on a DAVx⁵ event syncs up as a VALARM and
  the backend keeps it (rule 1).
- The Android Instances table returns cancelled single events when the SQL
  filter is lifted.

## Order

1. Roles + settings switch (ship-able alone: tray calendars just disappear).
2. Event fields (going, cancelled) on web and Android, display rule.
3. `setGoing` on both layers, with tests.
4. Tray UI and header button.
5. Read-only sheet, widget, gallery, e2e.
