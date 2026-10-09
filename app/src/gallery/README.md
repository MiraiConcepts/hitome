# Components gallery (development only)

A page that shows every UI piece of the app on sample data, for looking at the
whole design at once and at a phone's or a desktop's width. Nothing in it reads
or writes a real calendar. It is kept in the repository but is not in any
release: the two routes only load it when `__DEV__` is true, so the bundler
leaves it out of a release APK and of the exported web app, and the address
sends a release build back to the calendar.

- Web (run the dev server, log in): `/gallery` (a bar with Open at Mobile 390 /
  Desktop 1100, which opens a window of that width, and a section index) and
  `/gallery/view` (the content alone).
- Android (a dev build): `hitome:///gallery/view`.

## Keep it honest

Adding a component or a prop? Add or update its specimen in
`app/src/gallery/sections/`. The page typechecks with the app, so a changed prop
that breaks a specimen fails `bun run typecheck`.

## Remove it, if ever

1. Delete `app/src/app/gallery/` and `app/src/gallery/`.
2. Delete the `export` on `SnackBar` in
   `app/src/components/calendar/month-screen.tsx` (it was added for the gallery).
3. `cd app && bun run typecheck && bun run lint`.

## Not previewable

- Android agenda widget on the web: drawn with react-native-android-widget's
  primitives, which only render on Android. On Android the page draws it with
  `WidgetPreview` over sample events. `docs/screenshots/widget.png` exists but
  sits outside `app/`, which Metro cannot bundle from.
- `MonthScreen` and `SettingsScreen` as whole screens: they fetch the real
  calendar. Every part of them is shown on its own instead.

## Shown other than live (and why)

- Event editor: the real header, fields and actions, in a copy of its two
  shells (`editor-shells.tsx`), on a sample controller (`sample-editor.ts`).
  The real shells build `useEventEditor`, which reads the calendar list and
  writes to the server, and cannot be handed sample data.
- Calendars card (Settings): assembled from its real parts with sample
  calendars; the real one reads the server's calendar list.
- Location suggestions: the real list is a Photon search; drawn from the same
  parts with made-up places.
- Weekday row: inline JSX in `month-screen.tsx`, copied.
- Account, Notifications and the login screen are the real components, live
  but view only (presses off), since their controls would sign out, log in
  or change settings.
