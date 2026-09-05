// Shared contract + look for the date/time fields. The .tsx/.web.tsx pairs
// must stay visually in sync with the editor's TextInputs — chrome constants
// live here so parity is structural, not copy-paste.
import { Spacing } from '@/constants/theme';

export type DateFieldProps = {
  /** 'YYYY-MM-DD' */
  value: string;
  onChange: (next: string) => void;
  /** Inclusive bounds, 'YYYY-MM-DD'. */
  min?: string;
  max?: string;
  testID?: string;
};

export type TimeFieldProps = {
  /** 'HH:MM' (24h) */
  value: string;
  onChange: (next: string) => void;
  testID?: string;
};

/**
 * The editor's field geometry — text inputs, date/time chips and the repeat
 * count share it, so every box in the form is the same height and radius.
 * Outlined, not filled: a 1px rule in the raised surface color
 * (`backgroundSelected`, applied by each field from `useTheme`) on the
 * sheet's own ground, turning accent on focus. Compact on purpose — 36pt
 * boxes keep a new event on one screen without scrolling.
 */
export const FieldChrome = {
  borderRadius: Spacing.one,
  borderWidth: 1,
  paddingHorizontal: Spacing.three - Spacing.one,
  paddingVertical: Spacing.one + Spacing.half,
  minHeight: 36,
  fontSize: 15,
} as const;

/** The label column beside a row of controls ("Starts", "Repeat"). */
export const LabelColumnWidth = 52;
