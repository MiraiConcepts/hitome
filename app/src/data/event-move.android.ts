import type { EditScope } from '@/data/events';
import type { CalEvent, EventChanges } from '@/caldav/types';

/** The phone has no drag on its grid (see event-move.ts); nothing calls this
 *  there. */
export async function moveToDay(
  _event: CalEvent,
  _changes: EventChanges,
  _scope?: EditScope
): Promise<() => Promise<void>> {
  throw new Error('Moving by dragging is web only');
}
