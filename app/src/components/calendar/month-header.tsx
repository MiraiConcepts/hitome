import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  runOnUI,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import {
  AddIcon,
  CalendarEventIcon,
  RefreshIcon,
  SettingsIcon,
} from '@/components/icons';
import { LoadingBar } from '@/components/loading-bar';
import { ThemedText } from '@/components/themed-text';
import { AccentColor, FontFamilyBold, Spacing } from '@/constants/theme';
import { agoLabel, longDayLabel } from '@/utils/date';

type Props = {
  /** e.g. "July 2026" — tracks the visible month while scrolling. */
  label: string;
  /** year*12 + month0 of the visible month — orders labels so the slide
   *  direction matches the scroll direction. */
  monthIndex: number;
  /** Sweep the loading bar along the top edge (initial fetch only). */
  loading: boolean;
  /** Spin the refresh icon (a button-pressed refresh is in flight). */
  refreshing: boolean;
  /** Today's dateString — the header's second line when all is well. Passed
   *  in rather than read here so it cannot disagree with the grid's today. */
  today: string;
  /** The last fetch failed and the calendar is running on cached data. */
  offline: boolean;
  /** That failure was the server refusing the login — a different problem with
   *  a different fix, and one a timestamp says nothing useful about. */
  authFailed: boolean;
  /** When the server last answered; null until the first landed fetch. */
  fetchedAt: Date | null;
  onToday: () => void;
  onRefresh: () => void;
  onAdd: () => void;
  onSettings: () => void;
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

/** The month title's type ("Oct 2026"), for anything that should be set the
 *  same way — the setup screen's app name. */
export const HEADER_TITLE_TYPE = {
  fontSize: Bar.titleSize,
  lineHeight: Math.round(Bar.titleSize * Bar.titleLineRatio),
} as const;

/** Label slide-through when the visible month changes mid-scroll. */
const LABEL_FADE_OUT_MS = 100;
const LABEL_FADE_IN_MS = 160;
/** How far the label drifts while fading (px). */
const LABEL_SHIFT_PX = 10;

/** One full refresh-icon revolution. */
const SPIN_MS = 800;

/** The freshness line when the server cannot be reached. Fixed rather than a
 *  palette token because the palette has no danger colour and this is the only
 *  place that wants one; light enough to carry on the header's black ground. */
const OFFLINE_COLOR = '#F09595';

/** Header bar above the month grid: the label (tap → today) and refresh. */
export function MonthHeader({
  label,
  monthIndex,
  loading,
  refreshing,
  today,
  offline,
  authFailed,
  fetchedAt,
  onToday,
  onRefresh,
  onAdd,
  onSettings,
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
    if (refreshing) {
      spin.value = 0;
      spin.value = withRepeat(
        withTiming(360, { duration: SPIN_MS, easing: Easing.linear }),
        -1
      );
      return;
    }
    // Landing, not cancelling: a fetch that answers mid-turn carries the glyph
    // on to the top of the turn it is in, at the same speed, so the icon never
    // stops askew. Run on the UI thread, where the live angle actually lives.
    runOnUI(() => {
      'worklet';
      const from = spin.value % 360;
      if (from === 0) return;
      // Assigning a plain value stops the repeat; the timing below then covers
      // only what is left of this revolution.
      spin.value = from;
      spin.value = withTiming(
        360,
        {
          duration: SPIN_MS * ((360 - from) / 360),
          easing: Easing.linear,
        },
        (finished) => {
          // 0 and 360 are the same picture, so this is invisible — it just
          // leaves the next spin starting from a known angle.
          if (finished) spin.value = 0;
        }
      );
    })();
  }, [refreshing, spin]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value}deg` }],
  }));

  return (
    <View style={styles.header}>
      {/* The first fetch's progress, along the very top of the screen. */}
      <LoadingBar visible={loading} />
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
        </View>
        {/* Today's date, which is worth reading from any month — it is what
            the blue cell means once you have scrolled away from it. A
            timestamp is not: it only matters when the server is unreachable,
            so that is the only time it appears, and it appears in red with the
            reason attached. Fixed height in both states, so nothing here can
            push the grid down when it changes. */}
        <View style={styles.updatedRow}>
          {!offline && (
            // Marks the line as today's date rather than the visible month's.
            <CalendarEventIcon size={Bar.subtitleSize} color={AccentColor} />
          )}
          <ThemedText
            testID="calendar-updated"
            style={[styles.updated, offline && styles.updatedOffline]}
          >
            {!offline
              ? longDayLabel(today)
              : authFailed
                ? 'Login rejected · open Settings'
                : fetchedAt
                  ? `Offline · Updated ${agoLabel(fetchedAt, new Date())}`
                  : // Nothing has ever landed, so there is no age to report.
                    'Offline'}
          </ThemedText>
        </View>
      </View>
      <View style={styles.controls}>
        <Pressable
          testID="calendar-add"
          onPress={onAdd}
          hitSlop={8}
          style={styles.iconButton}
          accessibilityRole="button"
          accessibilityLabel="Add event"
        >
          <AddIcon size={Bar.iconSize} color={AccentColor} />
        </Pressable>
        <Pressable
          onPress={onRefresh}
          hitSlop={8}
          style={styles.iconButton}
          accessibilityRole="button"
          accessibilityLabel="Refresh"
        >
          <Animated.View style={spinStyle}>
            <RefreshIcon size={Bar.iconSize} color={AccentColor} />
          </Animated.View>
        </Pressable>
        <Pressable
          testID="calendar-settings"
          onPress={onSettings}
          hitSlop={8}
          style={styles.iconButton}
          accessibilityRole="button"
          accessibilityLabel="Settings"
        >
          <SettingsIcon size={Bar.iconSize} color={AccentColor} />
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
  updatedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + Spacing.half,
  },
  updated: {
    color: AccentColor,
    fontSize: Bar.subtitleSize,
    lineHeight: Bar.subtitleSize + 4,
    // Held open whatever the text says, so swapping the date for the offline
    // warning cannot move the grid beneath it.
    height: Bar.subtitleSize + 4,
  },
  updatedOffline: {
    color: OFFLINE_COLOR,
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
