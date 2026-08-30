// Tabler icons (https://icon-sets.iconify.design/tabler/) — the app's icon set.
// Raw 24x24 outline SVG bodies at Tabler's native stroke-width 2, stroked with
// `currentColor`. Shared by the in-app <Icon> components (components/icons.tsx,
// via react-native-svg) and the Android widget's SvgWidget (widget/agenda.tsx),
// so both render the same glyph. Consumers swap `currentColor` for the desired
// color — Tabler strokes rather than fills, so the swap lands on `stroke`.

export const AddOutlineBody =
  '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3c7.2 0 9 1.8 9 9s-1.8 9-9 9s-9-1.8-9-9s1.8-9 9-9m3 9H9m3-3v6"/>';

export const RefreshOutlineBody =
  '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.05 11a8 8 0 1 1 .5 4m-.5 5v-5h5"/>';

// All-day marker — a day this event covers end to end, whether it is a true
// all-day event or the middle of a longer one.
export const SunOutlineBody =
  '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0m-5 0h1m8-9v1m8 8h1m-9 8v1M5.6 5.6l.7.7m12.1-.7l-.7.7m0 11.4l.7.7m-12.1-.7l-.7.7"/>';

// Span-edge markers for a *timed* multi-day event: sunrise leads the day it
// starts, sunset the day it ends, leaving the sun to mean "all of this day".
// The two differ only in the arrow's direction, so they read as a pair rather
// than in isolation — the row's time and (n/N) carry the rest.
export const SunriseOutlineBody =
  '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 17h1m16 0h1M5.6 10.6l.7.7m12.1-.7l-.7.7M8 17a4 4 0 0 1 8 0M3 21h18M12 9V3l3 3M9 6l3-3"/>';

export const SunsetOutlineBody =
  '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 17h1m16 0h1M5.6 10.6l.7.7m12.1-.7l-.7.7M8 17a4 4 0 0 1 8 0M3 21h18M12 3v6l3-3M9 6l3 3"/>';

// Birthday-calendar marker — the widget's all-day glyph for the birthday
// calendar.
export const GiftOutlineBody =
  '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M3 9a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zm9-1v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7m2.5-4a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5a2.5 2.5 0 0 1 0 5"/></g>';
