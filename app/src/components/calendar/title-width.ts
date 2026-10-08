import { Platform } from 'react-native';

// An event title's one-line width, worked out before (or without) laying it
// out: the grid sizes slots from it, and a hovered chip frames its text with
// it. The web measures the title in the real font (loaded before the grid
// draws); elsewhere it is estimated from an averaged glyph width. Satoshi
// averages ~0.47em a glyph in mixed case, so the 0.56em estimate is wide on
// purpose: a borderline title takes a second slot rather than an ellipsis.

const contexts = new Map<number, CanvasRenderingContext2D | null>();

/** Width in px of `title` set on one line at `fontSize` in Satoshi. */
export function titleWidth(title: string, fontSize: number): number {
  if (Platform.OS === 'web') {
    if (!contexts.has(fontSize)) {
      const context = document.createElement('canvas').getContext('2d');
      if (context) context.font = `${fontSize}px Satoshi`;
      contexts.set(fontSize, context);
    }
    const context = contexts.get(fontSize);
    // A pixel of slack for sub-pixel layout rounding.
    if (context) return context.measureText(title).width + 1;
  }
  return title.length * fontSize * 0.56;
}
