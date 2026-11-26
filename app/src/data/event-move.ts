// Moving an event to another day by dragging it on the month grid, with an
// Undo. Web only (the drag is the web grid's); a phone moves an event in
// its editor. Kept apart from events.ts so the Android backend need not
// offer it (see event-move.android.ts).
export { updateEventUndoable as moveToDay } from '@/caldav/events';
