import { Platform } from 'react-native';

/** Window width from which the web grid's text and slots grow. */
const WIDE_GRID_MIN_WIDTH = 1100;

/**
 * How much larger the month grid's type (and the slots it sits in) is drawn.
 * A desktop window gives each day cell five times a phone's width, and the
 * phone's 11px event text left those cells looking empty. Exactly 1 on the
 * phone and on narrow windows, so nothing there moves.
 *
 * Read once, when the grid's modules load, because the slot geometry is a set
 * of module constants that the row layout and the slot count both read: a
 * window resized across the line keeps its size until the next load.
 */
export const GRID_SCALE =
  Platform.OS === 'web' &&
  typeof window !== 'undefined' &&
  window.innerWidth >= WIDE_GRID_MIN_WIDTH
    ? 1.15
    : 1;

/** A grid dimension at GRID_SCALE, whole pixels. */
export function scaled(px: number): number {
  return Math.round(px * GRID_SCALE);
}
