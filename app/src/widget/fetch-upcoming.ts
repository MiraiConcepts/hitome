// Fetches the widget's event window and reduces it to the next-10 snapshot.
import { fetchMonth } from '@/data/events';
import { ensureCalendarRoles, onCalendar } from '@/config/calendar-visibility';

import { selectUpcoming, toWidgetEvent } from './select-upcoming';
import type { WidgetEvent } from './types';

/** How far ahead the widget looks for its events. */
export const HORIZON_DAYS = 60;

/** Next 10 upcoming events from `now`; throws when Radicale is unreachable. */
export async function fetchUpcoming(now: Date): Promise<WidgetEvent[]> {
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + HORIZON_DAYS);
  const [events, roles] = await Promise.all([
    fetchMonth(now, horizon),
    ensureCalendarRoles(),
  ]);
  const shown = events.filter((e) => onCalendar(e, roles, now));
  return selectUpcoming(shown, now).map(toWidgetEvent);
}
