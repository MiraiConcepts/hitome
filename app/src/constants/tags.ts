import { Colors, OnAccentColor } from '@/constants/theme';

/** The blue of a location tag, shared by the agenda widget and the day list:
 *  the app's one blue. */
export const LOCATION_FILL = Colors.dark.link;
/** Its text: dark ink, as on the accent's chips (about 7.7:1 on the blue). */
export const ON_LOCATION_FILL = OnAccentColor;

/**
 * One tag: the place, the join link and the link's host in the day list, and
 * the agenda widget's chips. They were 11px, 10px on the phone and 11 in the
 * widget; the grid's own event strips are 11 as well, and its "+N more" 12,
 * so they now all stand at this size.
 */
export const TAG = {
  fontSize: 11,
  lineHeight: 15,
  paddingHorizontal: 6,
  paddingVertical: 2,
} as const;
