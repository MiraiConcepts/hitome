# Search: plan

Status: built 2026-11-03, uncommitted. Unit tests, typecheck, lint and
format pass; looked at in the gallery (phone and wide). Not yet run: the
e2e spec (`tooling/e2e/run.sh search.spec.ts`), the real Radicale, the phone.

Every choice below was picked by the
user from options (mockups for the layout, questions for the rest).

## In plain words

Like searching Gmail, for your calendar. Tap the magnifier (or press `/` on
the web), type, and get an agenda of every matching event, opened at today:
earlier above, later below. Tap one and it opens; close it and you are back
in the results where you were.

## Decisions

| Question | Picked |
| --- | --- |
| Phone layout | A page: black bar with a back arrow and the box on top, results between the box and the keyboard. Android Back closes. |
| Wide web layout | A centred box over the blurred grid, like the event editor. Opened by the magnifier or `/`. |
| Header spot | Magnifier first, left of discover: search, discover, share, add, settings (refresh stays web-only after settings). |
| Fields | Title, place and notes. |
| Matching | Every typed word must start a word somewhere in those fields, any order (as Outlook and Apple Mail do). "den" finds Dennis and Dentist, not Golden. Case, accents and punctuation ignored ("cafe" = "Café", "obrien" = "O'Brien"). |
| Time span | Everything: the calendar's whole range, 1900 to 2100. |
| Calendars | All of them: shown, discover (going or not) and hidden. |
| Repeating events | Every date, as an agenda opened at today, loading more as you scroll either way (the way Google and Apple Calendar list them). |
| Hidden calendar rows | Greyed, with an eye-off mark beside the calendar name. |
| Discover, not going | Dashed outline, as on the grid in discover mode. |
| Cancelled | Crossed out. |
| Empty box | Nothing, just the box and the keyboard. |
| After opening a result | Back in the results, same words and scroll spot. |
| Tap: shown calendar | The grid moves to that month under the search; the editor opens. |
| Tap: hidden calendar | The editor opens; the grid does not move (it would not show the event). |
| Tap: discover event | Its page (`openPage`), as on the grid. hitome never edits one. |

## How it finds events without spelling out 200 years

The grid's `fetchMonth` expands every repeat in its range; over 1900 to 2100
that is far too much. Search instead reads each event **once, as written**
(one "Gym every Tuesday", not ten thousand Gyms), matches on that, and works
out actual dates only for the events that matched, and only for the stretch
of the list you have scrolled to.

- **Web** (`src/caldav/search.ts`): one `fetchCalendarObjects` per calendar
  **without a time range** (every object, unexpanded), all calendars from
  `getCalendars()` including hidden ones. Pull SUMMARY / LOCATION /
  DESCRIPTION from each VEVENT (an override's own text counts too), match,
  keep the matching objects with their calendar's colour and icon. Dates
  come from the existing `expandBetween()` in `src/caldav/expand.ts`, a
  window at a time.
  Measure the first fetch on the real Radicale; if it is slow, keep the
  objects in memory between openings and refetch only calendars whose
  ctag changed.
- **Android** (`src/store/search.ts`): one query on the Events table with
  `title LIKE ? OR eventLocation LIKE ? OR description LIKE ?` per word
  (a loose first cut, done by the store), then the word-start rule in JS.
  Dates come from the Instances table for just those event ids, a window at
  a time. Every synced calendar (the store's `visible = 1 AND
  sync_events = 1`, which is Android's setting, not hitome's roles), so
  hitome-hidden calendars are included. Works offline.
- **Shared** (`src/utils/search.ts`, pure, no React): `normalize`,
  `wordStarts`, `matches(fields, words)` returning the title ranges to mark,
  and the agenda paging: given matched events and a window, return rows in
  date order. Windows start at today -1 year .. +1 year and grow by a year at
  whichever end you scroll to, until 1900 or 2100 or the last occurrence.
  Each row carries its role (shown / tray / hidden), going, cancelled.
- Every keystroke filters the already-fetched set in memory: no request per
  letter, no debounce. Only the first opening waits on the fetch (the
  loading bar runs under the box).
- **Offline on the web**: the fetch fails, so search falls back to the
  months already loaded in month-screen, with a line under the box: "Only
  months already loaded".

## Pieces

1. `src/utils/search.ts` + `search.test.ts`: accents, punctuation, word
   starts (Dennis yes, Golden no), several words in any order, place and
   notes hits, an override's own title, a repeat paged across windows, the
   edges (1900, 2100, a series with an end), cancelled kept.
2. `src/caldav/search.ts` and `src/store/search.ts`, exported through
   `src/data/events` (as `searchSource()` or similar: load once, then
   `occurrences(matched, window)`), with a store test against
   `fake-store.testing.ts`.
3. `src/hooks/use-event-search.ts`: loads on open, filters per keystroke,
   grows the window on scroll, `{ rows, loading, partial, loadEarlier,
   loadLater }`. Refetches quietly after an edit or delete made from a
   result, so the list never shows the old version.
4. `src/components/calendar/search-screen.tsx`: one component, two shells
   by `useIsWide()`.
   - Phone: full-screen `Modal`; `FlatList` with
     `keyboardShouldPersistTaps="handled"` (first tap opens a row while the
     keyboard is up) and `keyboardDismissMode="on-drag"`; opens scrolled to
     today; `onStartReached` / `onEndReached` load the next year. Back:
     `BackHandler`.
   - Wide web: centred box with `BlurBackdrop`; Escape closes
     (`useEscapeKey`); Up / Down move through rows, Enter opens.
   - Rows: date and time column like the day list (`day-popover.tsx`'s
     `WHEN_COLUMN`, `ROW_FONT`), title with matched word starts marked in
     amber, `CalendarMark` and calendar name, the place on a second line
     when it matched. Month headers between months ("November 2026").
     Hidden: greyed with `EyeOffIcon`. Discover not going: dashed outline.
     Cancelled: crossed out. Square, no em-dashes.
   - The bar's messages ("Saved to Personal", Undo) must show while the
     page covers the grid: the search page renders the same `SnackBar`.
5. `SearchIcon` (Tabler `search` in `icon-paths.ts`, `icons.tsx`); header
   `onSearch`, `testID="calendar-search"`, label "Search", first in the row.
6. `month-screen.tsx`: `searching` state, counted as an overlay (keys off,
   discover's Back handler stands aside). The editor opens above the search
   (search stays mounted), so closing it returns to the results. Picking a
   shown event scrolls the grid behind (`scrollToMonth`); hidden does not.
7. `use-calendar-keys.ts` / `.web.ts`: `onSearch`, bound to `/`.
8. Copy (page text, not bar messages): placeholder "Search events",
   "Nothing matches", "Only months already loaded", "No earlier events" /
   "No later events" at the ends.
9. Gallery specimen: phone and wide, with results (a repeat, a hidden one,
   a not-going discover one, a cancelled one), nothing matching, offline.
10. `tooling/e2e/search.spec.ts`: seed a weekly event, an accented title, a
    hidden calendar, a cancelled event. Open by button and by `/`; check
    word-start matching, the agenda opens at today, scrolling loads an
    earlier year, the hidden row is greyed, open one and close back to the
    results.

## To verify while building

- First-open time on the real Radicale (web) and on the phone's store.
- Results stay above the keyboard on the phone (Expo's default
  `softwareKeyboardLayoutMode`, resize; `app.json` does not set it).
- Five header icons fit on the Pixel_9_Pro_XL emulator and the phone.
- Two overlays at once (editor over search) on the wide web: Escape closes
  only the top one.
- An event opened from a month the grid has not loaded: saving it refreshes
  both the search list and that month.

## Not in this

Searching from the widget, recent searches, filters by calendar or date,
attendees, server-side full-text search.
