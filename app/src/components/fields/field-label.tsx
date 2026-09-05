import { StyleSheet } from 'react-native';

import { ThemedText, type ThemedTextProps } from '@/components/themed-text';

/**
 * The caption beside or above a field ("Starts", "Repeat", …). One
 * component so every caption in the editor is the same size and shade —
 * the widget's day headings are the same idea, small, bold and set back
 * from the row text.
 */
export function FieldLabel({ style, ...rest }: ThemedTextProps) {
  return (
    <ThemedText
      type="smallBold"
      themeColor="textSecondary"
      style={[styles.label, style]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 12,
    lineHeight: 16,
  },
});
