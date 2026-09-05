// Web date field: a themed native <input type="date"> — value is always
// 'YYYY-MM-DD' regardless of locale display. Geometry/behavior twin:
// date-field.tsx (Compose dialog).
import { Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

import { FieldChrome, type DateFieldProps } from './field-chrome';
import { ensureFieldCss } from './web-input-css';

export function DateField({
  value,
  onChange,
  min,
  max,
  testID,
}: DateFieldProps) {
  const theme = useTheme();
  const scheme = useColorScheme() ?? 'light';
  ensureFieldCss();

  return (
    <input
      type="date"
      className="hitome-field-input"
      data-testid={testID}
      value={value}
      min={min}
      max={max}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => {
        // Open the popup from a tap anywhere in the field (Baseline 2022);
        // browsers without a popup just keep their native behavior.
        try {
          (e.currentTarget as HTMLInputElement).showPicker?.();
        } catch {
          // Needs user activation / unsupported — native behavior stands.
        }
      }}
      style={{
        borderRadius: FieldChrome.borderRadius,
        border: `${FieldChrome.borderWidth}px solid ${theme.backgroundSelected}`,
        padding: `${FieldChrome.paddingVertical}px ${FieldChrome.paddingHorizontal}px`,
        minHeight: FieldChrome.minHeight,
        fontSize: FieldChrome.fontSize,
        backgroundColor: 'transparent',
        color: theme.text,
        fontFamily: Fonts.sans,
        // Flips the browser picker popup + glyphs to the app's scheme.
        colorScheme: scheme,
        width: '100%',
        boxSizing: 'border-box',
      }}
    />
  );
}
