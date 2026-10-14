import { AccentColor } from '@/constants/theme';
import { rgbHex } from '@/utils/color';

/** A calendar's colour as everything draws it: its own, else the accent,
 *  as plain #RRGGBB (a store colour may carry alpha, which the mixes and
 *  contrast checks ignore anyway). Not in utils/color, which stays free of
 *  the theme so it tests without React Native. */
export function calendarTint(color: string | undefined): string {
  return rgbHex(color ?? AccentColor);
}
