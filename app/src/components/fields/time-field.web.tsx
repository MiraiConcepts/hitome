// Web time field: a themed native <input type="time"> — value is always 24h
// 'HH:MM' regardless of locale display. Geometry/behavior twin:
// time-field.tsx (Compose dialog).
import { Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

import { FieldChrome, type TimeFieldProps } from './field-chrome';
import { ensureFieldCss } from './web-input-css';

export function TimeField({ value, onChange, testID }: TimeFieldProps) {
  const theme = useTheme();
  const scheme = useColorScheme() ?? 'light';
  ensureFieldCss();

  return (
    <input
      type="time"
      className="hitome-field-input"
      data-testid={testID}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => {
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
        colorScheme: scheme,
        width: '100%',
        boxSizing: 'border-box',
      }}
    />
  );
}
