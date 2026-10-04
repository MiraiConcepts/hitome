import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { FieldLabel } from '@/components/fields/field-label';
import { Spacing } from '@/constants/theme';

import { LabelColumnWidth } from './field-chrome';

type Props = {
  label: string;
  children: ReactNode;
  testID?: string;
};

/**
 * A labelled row of the editor: the caption in a fixed column on the left,
 * the controls filling the rest. Labels beside controls rather than above
 * them is what buys the form its height back.
 */
export function FieldRow({ label, children, testID }: Props) {
  return (
    <View style={styles.row} testID={testID}>
      <FieldLabel style={styles.label}>{label}</FieldLabel>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  label: {
    width: LabelColumnWidth,
    // Centred on the first 28pt chip / 36pt field beside it.
    paddingTop: 8,
  },
  content: {
    flex: 1,
    gap: Spacing.one + Spacing.half,
  },
});
