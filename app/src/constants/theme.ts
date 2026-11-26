/**
 * hitome's colours. The app is dark only, on every platform and in the
 * widget: the calendar is drawn dark-first (black header block, accent-orange
 * ink, dark out-of-month fills), and a light scheme only ever produced a
 * half-light screen.
 *
 * `Colors.dark` keeps the key names of the shared MiraiConcepts/tokens dark
 * palette, so hitome can take that palette as it stands (dark half only)
 * without renaming anything. Colours below it are hitome's own.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  dark: {
    text: '#ffffff',
    background: '#1C1B22',
    backgroundElement: '#000000',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
    /** Placeholder text in empty fields: quieter than textSecondary, so a
     *  hint never reads as something already typed. (hitome's own.) */
    placeholder: '#6C7078',
    /** Dashed dividers inside a settings card, between rows and columns.
     *  (hitome's own.) */
    rule: '#3F4249',
    /** The dotted top edge of a settings card; a step stronger than `rule`.
     *  (hitome's own.) */
    ruleStrong: '#5C6068',
    /** hitome's one blue: tappable text, today's fill, the hold ink and the
     *  location tag. Light enough to read as text on the dark ground (6.3:1);
     *  anything drawn on it takes dark ink. */
    link: '#5B9DFF',
  },
} as const;

export type ThemeColor = keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'Satoshi',
    serif: 'Satoshi',
    rounded: 'Satoshi',
    mono: 'Satoshi',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const MaxContentWidth = 800;
/** Minimum window width treated as "wide" — the event editor renders as a
 * centered dialog above this and a bottom sheet below it. */
export const WideLayoutMinWidth = 768;

/**
 * Satoshi — the app's single typeface (files in assets/fonts, fetched from
 * Fontshare at install by scripts/fetch-fonts.mjs). One family name resolves
 * everywhere: RN + web (@font-face), and the RNAW widget,
 * which loads assets/fonts/<name>.otf by basename. Bold is a separate face.
 */
export const FontFamily = 'Satoshi';
export const FontFamilyBold = 'Satoshi_bold';
/** Regular-weight text everywhere (ThemedText, the fields, the widget): a
 *  step thicker than Satoshi Regular, which read thin (added 2026-10-15;
 *  the same Fontshare release as the other two). */
export const FontFamilyMedium = 'Satoshi_medium';

/**
 * Brand accent (matches the app icon). Duplicated in static config that can't
 * import TS — keep in sync when changing: app.json (adaptiveIcon + splash
 * backgroundColor), public/manifest.json (theme_color), and
 * android/app/src/main/res/values/colors.xml (iconBackground +
 * splashscreen_background).
 */
// Firefox brand palette (brandcolorcode.com/firefox): orange #FFBD4F,
// blue #0060E0, yellow #FFEA7F, red #FF505F, pink #E11586, purple #B933E1.
export const AccentColor = '#FFBD4F';
/** Burnt amber — a stronger orange than AccentColor, for deliberate emphasis
 * where the light accent is too faint. Opt-in per use; the default stays
 * AccentColor. (Not from the Firefox palette.) */
export const BrandColor = '#F5820D';
/** Destructive actions / validation errors. */
export const DangerColor = '#FF505F';
/** Text/icons on an accent-colored surface: dark ink, since
 * the Firefox orange is too light for white to stay readable on it. */
export const OnAccentColor = '#000000';
