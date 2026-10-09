// The phone's own calendar conventions — which day a week starts on, the
// 12- or 24-hour clock, and the time zone new events are written in — read once at launch and handed to the pure modules
// that lay out the grid and format times. Imported from index.ts, so the
// headless widget and reminder tasks get them too, along with the language
// the widget's day and month names are written in.
import { reloadAppAsync } from 'expo';
import { getCalendars, getLocales } from 'expo-localization';
import { AppState, Platform } from 'react-native';

import { setWriteZone } from '@/caldav/ics';
import { initWeekStart } from '@/config/week-start';
import { setClock24 } from '@/utils/date';
import { setNameLocale } from '@/widget/format';

try {
  const [calendar] = getCalendars();
  // expo-localization counts 1 = Sunday … 7 = Saturday; Date#getDay from 0.
  // Settings decides whether the grid uses it (Monday unless chosen).
  initWeekStart(calendar?.firstWeekday ? calendar.firstWeekday - 1 : 1);
  if (typeof calendar?.uses24hourClock === 'boolean')
    setClock24(calendar.uses24hourClock);
  else {
    // The web build asks Intl for a format with no hour in it, which has no
    // hour cycle, so it never knows; asking with an hour does.
    const cycle = new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
    }).resolvedOptions().hourCycle;
    if (cycle) setClock24(cycle === 'h23' || cycle === 'h24');
  }
  // The widget writes its own date lines; give it the phone's language.
  setNameLocale(getLocales()[0]?.languageTag);
  // New events are written in the phone's zone (see caldav/ics).
  setWriteZone(calendar?.timeZone ?? undefined);
} catch {
  // Unknown: Monday weeks, a 24-hour clock and English names, as before.
  initWeekStart(1);
}

/** The phone's zone as Android has it now (read fresh on every call). */
function phoneZone(): string | undefined {
  try {
    return getCalendars()[0]?.timeZone ?? undefined;
  } catch {
    return undefined;
  }
}

// The JS engine reads the zone's offset once, when it starts, and is never
// told of a change: after the phone's zone changes, every local date in this
// running app (the grid, today, event times, the widget's rows) stays in the
// old zone. Start the app again when it next comes forward; the launch then
// redraws the widget and reschedules reminders in the new zone.
const launchZone = phoneZone();
if (Platform.OS === 'android' && launchZone) {
  AppState.addEventListener('change', (state) => {
    if (state !== 'active') return;
    const zone = phoneZone();
    if (zone && zone !== launchZone)
      reloadAppAsync('Time zone changed').catch(() => {});
  });
}
