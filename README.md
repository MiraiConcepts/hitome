# hitome

hitome is a calendar for me.

# Capabilities

hitome draws a self-hosted calendar as one continuous grid of weeks on the web
and on Android, edits it without disturbing what other clients wrote, and rings
its reminders on the device itself.

- Every calendar on the account is read at once, and each event carries its own
  calendar's colour and marker glyph, so the month reads as one calendar without
  the calendars being merged.
- The grid is a single ribbon of weeks spanning five years either side of today,
  snapped to month starts. A month boundary is a landing point rather than a
  separate screen, so a week is never drawn twice and scrolling never restarts.
- Fetched months accumulate and are only ever replaced by a fresher fetch,
  never dropped on navigation, which is what used to make events vanish
  mid-scroll. Neighbouring months are prefetched outward in waves.
- Each month keeps its last good result on disk. An unreachable server costs
  freshness, not a blank grid, and the same snapshots feed the alarm pass on a
  cold start.
- An edit rewrites only the fields the editor owns. Unknown properties, foreign
  alarms and recurrence rules richer than the presets survive byte-identical,
  because this calendar is written to by other clients as well.
- Writes carry the object's etag, so an event that changed underneath is
  refused rather than overwritten.
- Deletion removes the whole object, and undo re-writes the original bytes
  under the original identifier, back into the calendar they came from rather
  than the default one.
- Reminders are scheduled as one alarm per concrete occurrence inside a rolling
  two-week horizon, because the platform has no recurring trigger. Every open
  re-derives the whole set and reschedules it, since a force-stop can wipe the
  registrations while still reporting them as scheduled.
- The home-screen widget renders headlessly from its own snapshot, refetching on
  its update cycle and on a tap. It shows the agenda whether or not the server
  is reachable, and an event carrying a recognised meeting link becomes a
  tappable way into that meeting.
- Location autocomplete is the only third-party call, and it fails silently:
  debounced, cached, and abandoned for the session after three consecutive
  failures, leaving an ordinary text field behind.
- No credentials exist client-side. The app is served from the same origin as
  the calendar server and the host proxy injects the authorization, so no
  bundle, image, device or CI secret holds the password.
- Web and Android ship from one tag. The same commit produces the container
  image and the signed APK, so the two halves cannot report different versions.
  Android is delivered as a release artifact tracked by an updater rather than
  through an app store.
