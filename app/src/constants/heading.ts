/**
 * The heading of a dialog that is about a day: the editor's header and the
 * day list's title are one size, so the same day reads the same in both. (The
 * settings screen's title is this size too.)
 */
export const DayHeading = {
  size: 28,
  /** A ratio, not a number, so the line box cannot fall behind the size: a
   *  line shorter than the font clips the glyphs. */
  lineRatio: 1.3,
} as const;
