// The phone's own calendar conventions — which day a week starts on, and the
// 12- or 24-hour clock — read once at launch and handed to the pure modules
// that lay out the grid and format times. Imported from index.ts, so the
// headless widget and reminder tasks get them too, along with the language
// the widget's day and month names are written in.
import { getCalendars, getLocales } from 'expo-localization';

import { setFirstDayOfWeek } from '@/utils/calendar-grid';
import { setClock24 } from '@/utils/date';
import { setNameLocale } from '@/widget/format';

try {
  const [calendar] = getCalendars();
  // expo-localization counts 1 = Sunday … 7 = Saturday; Date#getDay from 0.
  if (calendar?.firstWeekday) setFirstDayOfWeek(calendar.firstWeekday - 1);
  if (typeof calendar?.uses24hourClock === 'boolean')
    setClock24(calendar.uses24hourClock);
  // The widget writes its own date lines; give it the phone's language.
  setNameLocale(getLocales()[0]?.languageTag);
} catch {
  // Unknown: Monday weeks, a 24-hour clock and English names, as before.
}
