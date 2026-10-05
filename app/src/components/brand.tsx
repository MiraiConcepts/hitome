import { Image, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { AccentColor, FontFamilyBold } from '@/constants/theme';

/**
 * The app's name as a mark, wherever a sentence says it: the glyph and
 * "hitome" in the accent, set inline in the surrounding text (nest it in a
 * ThemedText). `size` is the surrounding font size.
 */
export function Brand({ size = 14 }: { size?: number }) {
  return (
    <ThemedText
      style={[styles.name, { fontSize: size }]}
      accessibilityLabel="hitome"
    >
      <Image
        source={require('@/assets/images/widget-icon.png')}
        style={{ width: size, height: size, tintColor: AccentColor }}
        accessibilityElementsHidden
      />{' '}
      hitome
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  name: {
    color: AccentColor,
    fontFamily: FontFamilyBold,
  },
});
