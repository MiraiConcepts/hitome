// Pure color helpers (no RN/expo imports — bun-testable).

/**
 * Dark vs light foreground for text drawn on `hex`, by WCAG relative luminance.
 * Accepts #RGB, #RRGGBB or #RRGGBBAA — the alpha byte is ignored (it doesn't
 * change the fill's perceived lightness against the card). A bad string yields
 * the dark default. Returns literal theme colors (dark OnAccent / white).
 */
export function readableTextColor(hex: string): '#1C1B22' | '#FFFFFF' {
  const rgb = parseHex(hex);
  if (!rgb) return '#1C1B22';
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // 0.179 ≈ the luminance where black/white text contrast ratios cross over.
  return luminance > 0.179 ? '#1C1B22' : '#FFFFFF';
}

/**
 * Normalize a hex color to #RRGGBB — expands #RGB shorthand and drops the alpha
 * byte of #RRGGBBAA (SVG fills and other 6-digit consumers). Returns the input
 * unchanged when it isn't recognizable hex.
 */
export function rgbHex(hex: string): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  return `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** [r, g, b] 0–255 from a hex string, or null when it isn't valid hex. */
function parseHex(hex: string): [number, number, number] | null {
  if (typeof hex !== 'string') return null;
  let h = hex.replace(/^#/, '');
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  if (h.length === 8) h = h.slice(0, 6); // drop alpha
  if (h.length !== 6 || /[^0-9a-f]/i.test(h)) return null;
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
