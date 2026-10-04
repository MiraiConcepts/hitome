# Recurring-event scope + public-readiness fixes

Created: 2026-10-04 · Status: IN PROGRESS

Follows the feature-gap review (connect / settings / month view). Order agreed
with the user: event sheet redesign first (done, 435a13d), then this list,
worked autonomously.

## 1. Recurring events: this / this and following / all  (data-loss fix)

Bug: editing the time of occurrence N wrote the occurrence's own date into the
series DTSTART (`editPreserving` → `event.startDate = …`), so every earlier
occurrence vanished — on the server and every client syncing it. Delete only
ever removed the whole object.

Design (all ICS work pure, in `caldav/ics.ts`, bun-tested):
- `CalEvent.recurrenceStart` — unix seconds of the occurrence's original start
  (its RECURRENCE-ID, actual or would-be). Set for every recurring occurrence.
- **All** — edit the master only (never the first VEVENT, which may be an
  override). A time change is applied as a *shift*: new start − the
  occurrence's displayed start, added to the master DTSTART; duration from the
  new start/end. A title-only edit stays byte-identical as before.
- **This** — edit (or create) the override VEVENT with RECURRENCE-ID =
  the occurrence; created as a clone of the master minus RRULE/RDATE/EXDATE.
  Not offered when the repeat rule itself changed.
- **This and following** — split: the original's RRULE gets UNTIL just before
  the occurrence (COUNT dropped); a new object (new UID) starts at the
  occurrence with the changes, the old rule (COUNT reduced by occurrences
  already past) and the overrides from the split on. On the first occurrence
  it is the same as All.
- Delete: **This** → EXDATE (and drop its override); **following** → UNTIL
  truncation; **All** → delete the object. Undo restores the original ICS
  (re-PUT for whole deletes, overwrite for the partial ones).
- UI: Save/Delete on a repeating event with real changes asks for the scope in
  the action bar (no extra modal).
- Found while testing live: shifting a whole series stranded its EXDATEs and
  overrides (they name occurrences by their old start), so a deleted occurrence
  came back and a moved one lost its edits. They now shift with the master.

Verified: 16 new bun tests (`__tests__/recurring.test.ts`); every scoped write
PUT to a throwaway Radicale and read back (UTC weekly with COUNT, Apple
TZID daily, all-day); on the phone, the scope question on a real yearly event
(answered Back — nothing changed). The web e2e suite still stops at step 2 on
the pre-existing `?day=` deep-link bug (see settings-and-runtime-config-plan),
so its updated recurring step has not run; `history.scrollRestoration` was
tried as the cause and ruled out.

## 2. Move an event to another calendar — DONE

The Calendar row shows for existing events too, selecting the event's own
calendar. Choosing another moves the whole object (create in the target, then
delete the original under its etag; the copy is removed again if that delete
is refused). A repeating event moves with every occurrence, and says so.
## 3. Notifications: preview, open the event, Snooze/Join, default reminder

- A reminder carries its event (CalEvent.id) and meeting link; a tap opens
  the event (`openInApp` → the same deep-link path the widget uses — native
  links arrive by intent, so in-app ones are pushed to the source directly).
- Buttons: Snooze 10 min on every reminder, Join first when there is a meeting
  link (`findMeetingLink`, shared with the widget). Snooze is answered in a
  headless task while the app is closed (`expo-task-manager`, new native dep:
  the dev client was rebuilt; the release picks it up from CI), keyed by the
  reminder so the listener and the task cannot both schedule one.
- Settings → Notifications: default alert for new timed events (prefills the
  editor), and a sample reminder drawn as an Android notification.
- Not yet watched on the device: the phone was asleep after the rebuild.
## 4. Hide calendars; Sign out and erase; connect help; About links
## 5. Follow the phone: week start, 12/24h, widget language
