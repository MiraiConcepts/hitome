import { useId, type ComponentType, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { FieldLabel } from '@/components/fields/field-label';
import type { IconProps } from '@/components/icons';
import { AccentColor, Spacing } from '@/constants/theme';

type Props = {
  label: string;
  /** A small glyph ahead of the caption, drawn in the caption's own colour. */
  icon?: ComponentType<IconProps>;
  children: ReactNode;
  testID?: string;
};

/** Caption glyph size: the caption's 16pt line, less a little air. */
const ICON_SIZE = 14;

/**
 * A labelled field with its caption above it rather than beside it — for a
 * form of a few full-width fields (the server connection card), where the
 * editor's side column would only squeeze the input. FieldRow is the
 * side-by-side counterpart. Captions are in the accent, glyph included.
 */
export function FieldStack({ label, icon: Icon, children, testID }: Props) {
  // The caption names the group, so a screen reader entering a row of
  // chips or a pair of date and time boxes hears what they are for.
  const captionId = useId();
  return (
    <View
      style={styles.stack}
      role="group"
      aria-labelledby={captionId}
      testID={testID}
    >
      <View style={styles.caption}>
        {Icon && <Icon size={ICON_SIZE} color={AccentColor} />}
        <FieldLabel style={styles.label} nativeID={captionId}>
          {label}
        </FieldLabel>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: Spacing.two,
  },
  label: {
    color: AccentColor,
  },
  caption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + Spacing.half,
  },
});
