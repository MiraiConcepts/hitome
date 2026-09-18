import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { FieldLabel } from '@/components/fields/field-label';
import { Spacing } from '@/constants/theme';

import { LabelColumnWidth } from './field-chrome';

type Props = {
  label: string;
  children: ReactNode;
  /** Widen the caption column for captions that are words rather than the
   *  editor's abbreviations ("Password" wraps at the default 52). */
  labelWidth?: number;
  testID?: string;
};

/**
 * A labelled row of the editor: the caption in a fixed column on the left,
 * the controls filling the rest. Labels beside controls rather than above
 * them is what buys the form its height back.
 */
export function FieldRow({
  label,
  children,
  labelWidth = LabelColumnWidth,
  testID,
}: Props) {
  return (
    <View style={styles.row} testID={testID}>
      <FieldLabel style={[styles.label, { width: labelWidth }]}>
        {label}
      </FieldLabel>
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
    // Centred on the first 28pt chip / 36pt field beside it.
    paddingTop: 8,
  },
  content: {
    flex: 1,
    gap: Spacing.one + Spacing.half,
  },
});
