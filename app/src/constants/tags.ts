/** The blue of a location tag, shared by the agenda widget and the day list.
 *  Not the scheme's link blue: the dark scheme's (#5B9DFF) is far too light to
 *  carry white text. This holds roughly 5:1 against white in either scheme. */
export const LOCATION_FILL = '#0060E0';

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
