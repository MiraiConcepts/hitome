import { startTransition, useEffect, useEffectEvent, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

import type { EventIcon } from '@/caldav/types';
import { CalendarMark } from '@/components/calendar/calendar-mark';
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
   *  its calendar mark at rest, colored outline + text + faint fill when
   *  selected. */
  color?: string;
  /** Which calendar mark to show beside a colored option. */
  icon?: EventIcon;
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

const CHIP_HIT_SLOP = { top: 10, bottom: 10, left: 3, right: 3 };

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
  // A tap only moves the highlight; what it sets off (a settings write, the
  // widget redrawn, the grid re-laid for a new week start) runs once that is
  // on screen, so the chip never waits on it.
  const [pending, setPending] = useState<T | null>(null);
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setPending(null);
  }
  const shown = pending ?? value;
  const commit = useEffectEvent((next: T) => onChange(next));
  useEffect(() => {
    if (pending === null || pending === value) return;
    startTransition(() => commit(pending));
  }, [pending, value]);
  const chips = options.map((option) => {
    const selected = option.value === shown;
    const own = option.color ? rgbHex(option.color) : null;
    return (
      <Pressable
        key={option.value}
        testID={testID ? `${testID}-${option.value}` : undefined}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={() => setPending(option.value)}
        // 28pt chips, reached as 48pt: the margin is invisible and stops
        // short of the 6pt gap's middle, so neighbours never overlap.
        hitSlop={CHIP_HIT_SLOP}
        android_ripple={{
          color: `${rgbHex(own ?? AccentColor)}40`,
          foreground: true,
        }}
        style={({ pressed }) => [
          styles.chip,
          singleLine && styles.chipCompact,
          selected
            ? own
              ? { borderColor: own, backgroundColor: tint(own) }
              : styles.chipAccent
            : {
                borderColor: theme.backgroundSelected,
                // Android has the ripple; elsewhere, a pressed fill.
                backgroundColor:
                  pressed && Platform.OS !== 'android'
                    ? theme.backgroundSelected
                    : 'transparent',
              },
        ]}
      >
        {own && <CalendarMark icon={option.icon} color={own} />}
        {/* Sized by an invisible bold copy, so selecting a chip (which
            bolds its label) never changes its width and shifts the row. */}
        <View>
          <ThemedText
            type="small"
            style={[styles.label, styles.labelSelected, styles.sizer]}
            // Hidden from screen readers on every platform (the older
            // accessibilityElementsHidden props are native-only, so web
            // read each chip's name twice).
            aria-hidden
          >
            {option.label}
          </ThemedText>
          <ThemedText
            type="small"
            style={[
              styles.label,
              styles.labelShown,
              selected && styles.labelSelected,
              selected && { color: own ?? OnAccentColor },
              !selected && own ? { color: theme.textSecondary } : null,
            ]}
          >
            {option.label}
          </ThemedText>
        </View>
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
  // Tight enough that the repeat presets (None → Yearly) fit a phone's
  // width without the last one cut off at the edge.
  chipCompact: {
    paddingHorizontal: Spacing.one + Spacing.half,
  },
  chipAccent: {
    borderColor: AccentColor,
    backgroundColor: AccentColor,
  },
  label: {
    fontSize: 13,
    lineHeight: 16,
  },
  sizer: {
    opacity: 0,
  },
  labelShown: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
  },
  labelSelected: {
    fontFamily: FontFamilyBold,
  },
});
