// Discover mode's reading of an event: what opening its page opens. Pure, so
// it is tested without the screen.
import type { CalEvent } from '@/caldav/types';
import { openableLink } from '@/widget/meeting-link';

/** What opening a discover event's page opens: the event's URL, else the
 *  first web link in its notes (Android's store does not carry URL; the
 *  Filmhouse feed puts the booking link first in DESCRIPTION too). Undefined
 *  when there is none, or only one unsafe to open. */
export function trayLink(event: CalEvent): string | undefined {
  const candidate =
    event.link ?? /https?:\/\/[^\s<>"]+/i.exec(event.description ?? '')?.[0];
  return candidate ? openableLink(candidate) : undefined;
}
