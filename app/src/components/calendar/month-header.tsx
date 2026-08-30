import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { AddIcon, RefreshIcon } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { AccentColor, FontFamilyBold, Spacing } from '@/constants/theme';
import { toTimeString } from '@/utils/date';

type Props = {
  /** e.g. "July 2026" — tracks the visible month while scrolling. */
  label: string;
  /** year*12 + month0 of the visible month — orders labels so the slide
   *  direction matches the scroll direction. */
  monthIndex: number;
  /** Show a small spinner next to the label (initial fetch only). */
  loading: boolean;
  /** Spin the refresh icon (a button-pressed refresh is in flight). */
  refreshing: boolean;
  /** When the server last answered; null until the first landed fetch. */
  fetchedAt: Date | null;
  onToday: () => void;
  onRefresh: () => void;
  onAdd: () => void;
};

/**
 * The header bar's measurements. Deliberately the app's own: the widget draws
 * a bar that looks like this one but sizes its text for a home-screen tile, so
 * the two are kept apart on purpose — changing a number here must not move the
 * widget, and vice versa.
 */
const Bar = {
  paddingHorizontal: 16,
  paddingVertical: 28,
  titleSize: 32,
  /** A ratio, not a number, so it cannot fall behind the size above: a line
   *  box shorter than the font clips the glyphs. Satoshi's own box is 1.25em;
   *  this rounds up from it for descender room. */
  titleLineRatio: 1.3,
  subtitleSize: 14,
  labelGap: 4,
  iconSize: 24,
  iconPadding: 6,
  iconGap: 6,
} as const;

/**
 * The header block's ground — this bar and the weekday row directly beneath
 * it, which read as one piece. Blacker than the screen behind the grid on
 * purpose, so the chrome sits back from the calendar instead of merging into
 * it. month-screen imports it for the weekday row.
 */
export const HEADER_GROUND = '#000000';

/** Label slide-through when the visible month changes mid-scroll. */
const LABEL_FADE_OUT_MS = 100;
const LABEL_FADE_IN_MS = 160;
/** How far the label drifts while fading (px). */
const LABEL_SHIFT_PX = 10;

/** One full refresh-icon revolution. */
const SPIN_MS = 800;

/** Header bar above the month grid: the label (tap → today) and refresh. */
export function MonthHeader({
  label,
  monthIndex,
  loading,
  refreshing,
  fetchedAt,
  onToday,
  onRefresh,
  onAdd,
}: Props) {
  // The displayed label trails the prop through a directional slide-fade:
  // scrolling to a later month carries the old label up and out and the new
  // one rises in from below (reversed for earlier months). A change landing
  // mid-animation retargets it, and the last-started exit's callback carries
  // the newest label (earlier ones are cancelled unfinished), so intermediate
  // months passed during a fast scroll are skipped, not queued.
  const [shown, setShown] = useState({ label, index: monthIndex });
  const labelOpacity = useSharedValue(1);
  const labelShift = useSharedValue(0);

  useEffect(() => {
    if (label !== shown.label) {
      const dir = monthIndex >= shown.index ? 1 : -1;
      labelShift.value = withTiming(-dir * LABEL_SHIFT_PX, {
        duration: LABEL_FADE_OUT_MS,
        easing: Easing.in(Easing.quad),
      });
      labelOpacity.value = withTiming(
        0,
        { duration: LABEL_FADE_OUT_MS, easing: Easing.in(Easing.quad) },
        (finished) => {
          if (!finished) return;
          // Reposition to the entry side while invisible; the fade-in
          // branch below then animates it back to rest.
          labelShift.value = dir * LABEL_SHIFT_PX;
          runOnJS(setShown)({ label, index: monthIndex });
        }
      );
    } else {
      // Mount no-op (already at rest); after a swap, the entry animation.
      labelOpacity.value = withTiming(1, {
        duration: LABEL_FADE_IN_MS,
        easing: Easing.out(Easing.quad),
      });
      labelShift.value = withTiming(0, {
        duration: LABEL_FADE_IN_MS,
        easing: Easing.out(Easing.quad),
      });
    }
  }, [label, monthIndex, shown, labelOpacity, labelShift]);

  const labelStyle = useAnimatedStyle(() => ({
    opacity: labelOpacity.value,
    transform: [{ translateY: labelShift.value }],
  }));

  // Refresh-icon spin while a fetch is in flight — clockwise, the way the
  // glyph's arrow points.
  const spin = useSharedValue(0);
  useEffect(() => {
    if (!refreshing) return;
    spin.value = 0;
    spin.value = withRepeat(
      withTiming(360, { duration: SPIN_MS, easing: Easing.linear }),
      -1
    );
    return () => {
      cancelAnimation(spin);
      spin.value = 0;
    };
  }, [refreshing, spin]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value}deg` }],
  }));

  return (
    <View style={styles.header}>
      <View style={styles.labelColumn}>
        <View style={styles.labelWrap}>
          <Pressable
            testID="calendar-today"
            onPress={onToday}
            hitSlop={8}
            accessibilityLabel="Go to today"
          >
            <Animated.View style={labelStyle}>
              <ThemedText
                type="subtitle"
                testID="calendar-header-label"
                style={styles.label}
              >
                {shown.label}
              </ThemedText>
            </Animated.View>
          </Pressable>
          {loading && <ActivityIndicator size="small" color={AccentColor} />}
        </View>
        {fetchedAt ? (
          <ThemedText testID="calendar-updated" style={styles.updated}>
            Last Updated: {toTimeString(fetchedAt)}
          </ThemedText>
        ) : null}
      </View>
      <View style={styles.controls}>
        <Pressable
          testID="calendar-add"
          onPress={onAdd}
          hitSlop={8}
          style={styles.iconButton}
          accessibilityLabel="Add event"
        >
          <AddIcon size={Bar.iconSize} color={AccentColor} />
        </Pressable>
        <Pressable
          onPress={onRefresh}
          hitSlop={8}
          style={styles.iconButton}
          accessibilityLabel="Refresh"
        >
          <Animated.View style={spinStyle}>
            <RefreshIcon size={Bar.iconSize} color={AccentColor} />
          </Animated.View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // The widget's header inverted: dark ground, accent ink. On a full screen
  // the orange reads better as the text than as the background.
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Bar.paddingHorizontal,
    paddingVertical: Bar.paddingVertical,
    gap: Bar.paddingHorizontal,
    backgroundColor: HEADER_GROUND,
  },
  label: {
    fontFamily: FontFamilyBold,
    color: AccentColor,
    // Explicit, so the text preset's own size and line height do not leak in.
    // The box is derived from the size, so raising one cannot clip the other.
    fontSize: Bar.titleSize,
    lineHeight: Math.round(Bar.titleSize * Bar.titleLineRatio),
  },
  labelColumn: {
    flexDirection: 'column',
    gap: Bar.labelGap,
    flexShrink: 1,
  },
  labelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexShrink: 1,
  },
  updated: {
    color: AccentColor,
    fontSize: Bar.subtitleSize,
    lineHeight: Bar.subtitleSize + 4,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Bar.iconGap,
  },
  iconButton: {
    padding: Bar.iconPadding,
  },
});
