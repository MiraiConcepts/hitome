import { Pressable, StyleSheet, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

import { ThemedText } from '@/components/themed-text';
import {
  AccentColor,
  FontFamilyBold,
  OnAccentColor,
  Spacing,
} from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { rgbHex } from '@/utils/color';

export type ChipOption<T extends string> = {
  value: T;
  label: string;
  /** Tint the chip in this color (a calendar's own) instead of the accent:
   *  a dot at rest, colored outline + text + faint fill when selected. */
  color?: string;
};

type Props<T extends string> = {
  options: readonly ChipOption<T>[];
  value: T;
  onChange: (next: T) => void;
  /** One line, never wrapping: compact chips that scroll sideways if they
   *  still do not fit (narrow screen, large text). For short option sets
   *  that read best as a single strip — repeat preset, alert offset. */
  singleLine?: boolean;
  testID?: string;
};

/** 12% of a color, as #RRGGBBAA — the selected chip's fill. */
const tint = (hex: string) => `${rgbHex(hex)}1F`;

/**
 * Row of selectable pills — the editor's dependency-free stand-in for a
 * dropdown (repeat preset, repeat end, alert offset, calendar). Wraps by
 * default so every option stays visible; `singleLine` keeps it to one strip.
 * Outlined at rest, filled when selected — accent, or the option's own color.
 */
export function ChipRow<T extends string>({
  options,
  value,
  onChange,
  singleLine = false,
  testID,
}: Props<T>) {
  const theme = useTheme();
  const chips = options.map((option) => {
    const selected = option.value === value;
    const own = option.color ? rgbHex(option.color) : null;
    return (
      <Pressable
        key={option.value}
        testID={testID ? `${testID}-${option.value}` : undefined}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={() => onChange(option.value)}
        style={({ pressed }) => [
          styles.chip,
          singleLine && styles.chipCompact,
          selected
            ? own
              ? { borderColor: own, backgroundColor: tint(own) }
              : styles.chipAccent
            : {
                borderColor: theme.backgroundSelected,
                backgroundColor: pressed
                  ? theme.backgroundSelected
                  : 'transparent',
              },
        ]}
      >
        {own && <View style={[styles.dot, { backgroundColor: own }]} />}
        <ThemedText
          type="small"
          style={[
            styles.label,
            selected && styles.labelSelected,
            selected && { color: own ?? OnAccentColor },
            !selected && own ? { color: theme.textSecondary } : null,
          ]}
        >
          {option.label}
        </ThemedText>
      </Pressable>
    );
  });
  if (singleLine)
    return (
      // Gesture-handler's ScrollView, so a sideways drag here is not taken
      // for the bottom sheet's own vertical pan.
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.row, styles.rowSingle]}
        testID={testID}
      >
        {chips}
      </ScrollView>
    );
  return (
    <View style={styles.row} testID={testID}>
      {chips}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one + Spacing.half,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + Spacing.half,
    borderWidth: 1,
    paddingHorizontal: Spacing.two + Spacing.half,
    height: 28,
  },
  rowSingle: {
    flexWrap: 'nowrap',
    gap: Spacing.one,
  },
  chipCompact: {
    paddingHorizontal: Spacing.two,
  },
  chipAccent: {
    borderColor: AccentColor,
    backgroundColor: AccentColor,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontSize: 13,
    lineHeight: 16,
  },
  labelSelected: {
    fontFamily: FontFamilyBold,
  },
});
