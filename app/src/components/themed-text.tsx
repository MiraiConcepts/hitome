import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { FontFamilyMedium, Fonts, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'small' | 'smallBold' | 'subtitle' | 'code';
  themeColor?: ThemeColor;
};

export function ThemedText({
  style,
  type = 'default',
  themeColor,
  ...rest
}: ThemedTextProps) {
  const theme = useTheme();
  const own = [
    type === 'default' && styles.default,
    type === 'title' && styles.title,
    type === 'small' && styles.small,
    type === 'smallBold' && styles.smallBold,
    type === 'subtitle' && styles.subtitle,
    type === 'code' && styles.code,
  ];
  // Regular-weight text is set in Satoshi Medium (2026-10-15: the regular
  // face read thin); text at 600 or more keeps Satoshi, which picks the
  // bold face from its weight as before. A style naming its own family
  // keeps it.
  const declared = StyleSheet.flatten([own, style])?.fontWeight;
  const weight = declared === 'bold' ? 700 : Number(declared) || 400;

  return (
    <Text
      style={[
        {
          color: theme[themeColor ?? 'text'],
          fontFamily: weight >= 600 ? Fonts.sans : FontFamilyMedium,
        },
        own,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  small: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 500,
  },
  smallBold: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 700,
  },
  default: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: 500,
  },
  title: {
    fontSize: 48,
    fontWeight: 600,
    lineHeight: 52,
  },
  subtitle: {
    fontSize: 32,
    lineHeight: 44,
    fontWeight: 600,
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: 12,
  },
});
